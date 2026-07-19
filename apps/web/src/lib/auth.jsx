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
    login: (email, password) => pb.collection('users').authWithPassword(email, password),
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
