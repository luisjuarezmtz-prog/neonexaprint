import React, { createContext, useContext, useEffect, useState } from 'react';
import pb from '@/lib/pocketbaseClient';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.record);
  useEffect(() => pb.authStore.onChange((_t, r) => setUser(r)), []);
  const value = {
    user,
    isAuthed: pb.authStore.isValid,
    isAdmin: user?.role === 'admin',
    isStaff: ['admin', 'operador', 'ventas'].includes(user?.role),
    isVerified: !!user?.verified,
    login: (email, password) => pb.collection('users').authWithPassword(email, password),
    // MFA (admin accounts only, once enabled): a successful password check on
    // an MFA-gated account fails with a mfaId instead of a token — the caller
    // requests an OTP by email, then completes login with that code + mfaId.
    requestLoginOTP: (email) => pb.collection('users').requestOTP(email),
    completeMfaLogin: (otpId, code, mfaId) => pb.collection('users').authWithOTP(otpId, code, { mfaId }),
    resendVerification: () => pb.collection('users').requestVerification(user.email),
    // Recuperación de cuenta. El correo lo arma PocketBase con la plantilla de
    // pb_migrations/1796000000_password_reset_email.js, que apunta a /restablecer.
    requestPasswordReset: (email) => pb.collection('users').requestPasswordReset(email),
    confirmPasswordReset: (token, password) =>
      pb.collection('users').confirmPasswordReset(token, password, password),
    // Cambiar la contraseña desde dentro exige la actual, así una sesión
    // abierta y olvidada no basta para secuestrar la cuenta. PocketBase
    // invalida el token al cambiarla, por eso hay que volver a autenticar.
    changePassword: async (oldPassword, password) => {
      const email = pb.authStore.record?.email;
      await pb.collection('users').update(pb.authStore.record.id, {
        oldPassword, password, passwordConfirm: password,
      });
      try {
        await pb.collection('users').authWithPassword(email, password);
      } catch {
        pb.authStore.clear(); // no se pudo renovar: que vuelva a entrar
        throw new Error('Contraseña actualizada. Vuelve a iniciar sesión.');
      }
    },
    signup: async (fields) => {
      const { email, password, name, phone = '', company = '', rfc = '' } = fields;
      await pb.collection('users').create({
        email, password, passwordConfirm: password, name, phone, company, rfc, role: 'member',
      });
      const auth = await pb.collection('users').authWithPassword(email, password);
      try { await pb.collection('users').requestVerification(email); } catch { /* ignore */ }
      return auth;
    },
    updateProfile: (data) => pb.collection('users').update(pb.authStore.record.id, data),
    logout: () => pb.authStore.clear(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
