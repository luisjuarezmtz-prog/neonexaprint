import React, { useState } from 'react';
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { Loader2, Mail, Check, AlertTriangle } from 'lucide-react';

function Shell({ title, subtitle, children }) {
  return (
    <PageShell hideFooter>
      <div className="min-h-[calc(100dvh-80px)] flex items-center justify-center px-6 py-16 relative overflow-hidden">
        <div className="absolute inset-0 nx-grid-bg opacity-50"/>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[#00AEEF]/15 blur-[140px]"/>
        <div className="relative w-full max-w-md nx-card p-10">
          <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">{subtitle}</div>
          <h1 className="font-display text-4xl font-black mt-3 uppercase">{title}</h1>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </PageShell>
  );
}

const inputClass = "w-full bg-black/50 border border-[#00AEEF]/30 px-4 py-3 rounded text-white placeholder:text-white/30 focus:outline-none focus:border-[#00F0FF] focus:ring-2 focus:ring-[#00F0FF]/30 transition";

export function LoginPage() {
  const { login, requestLoginOTP, completeMfaLogin, isAuthed } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(null); // { mfaId, otpId } once a second factor is required
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  if (isAuthed) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      if (mfa) {
        await completeMfaLogin(mfa.otpId, code, mfa.mfaId);
        nav('/dashboard');
        return;
      }
      await login(email, password);
      nav('/dashboard');
    } catch (ex) {
      const mfaId = ex?.response?.mfaId;
      if (mfaId && !mfa) {
        try {
          const { otpId } = await requestLoginOTP(email);
          setMfa({ mfaId, otpId });
        } catch { setErr('No se pudo enviar el código de verificación.'); }
      } else if (mfa) {
        setErr('Código incorrecto.');
      } else {
        setErr('Credenciales incorrectas.');
      }
    } finally { setLoading(false); }
  };
  return (
    <Shell title="Entrar" subtitle="NEONEXA · ACCESO">
      <form onSubmit={submit} className="space-y-4">
        {!mfa ? (
          <>
            <div>
              <label className="text-xs uppercase tracking-widest text-white/60">Email</label>
              <input className={inputClass + ' mt-2'} type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/>
            </div>
            <div>
              <label htmlFor="login-password" className="text-xs uppercase tracking-widest text-white/60">Contraseña</label>
              <input id="login-password" className={inputClass + ' mt-2'} type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}
                aria-invalid={!!err} aria-describedby={err ? 'login-error' : undefined}/>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="login-code" className="text-xs uppercase tracking-widest text-white/60">Código de verificación</label>
            <p className="text-white/50 text-xs mt-1 mb-2">Te enviamos un código a {email}. Revisa tu correo.</p>
            <input id="login-code" className={inputClass} inputMode="numeric" required value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" autoFocus
              aria-invalid={!!err} aria-describedby={err ? 'login-error' : undefined}/>
          </div>
        )}
        {err && <div id="login-error" role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        <button disabled={loading} className="nx-btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2">
          {loading && <Loader2 className="animate-spin" size={16}/>} {mfa ? 'Verificar código' : 'Entrar'}
        </button>
      </form>
      <div className="mt-6 text-sm text-white/60 space-y-2">
        {!mfa && <div><Link to="/recuperar" className="text-[#00F0FF]">¿Olvidaste tu contraseña?</Link></div>}
        <div>¿No tienes cuenta? <Link to="/register" className="text-[#00F0FF]">Crear una</Link></div>
      </div>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch {
      // No se distingue entre correo existente e inexistente: decirlo
      // permitiría averiguar quién tiene cuenta en el sitio.
      setSent(true);
    } finally { setLoading(false); }
  };

  if (sent) {
    return (
      <Shell title="Revisa tu correo" subtitle="NEONEXA · RECUPERAR">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#3ddc84]/20 flex items-center justify-center mx-auto"><Mail size={30} className="text-[#3ddc84]"/></div>
          <p className="text-white/65 mt-6">
            Si <b className="text-white/85">{email}</b> tiene una cuenta, le enviamos un enlace para elegir una contraseña nueva.
          </p>
          <p className="text-white/40 text-sm mt-3">Revisa también la carpeta de spam. El enlace vence pronto por seguridad.</p>
          <Link to="/login" className="nx-btn-ghost px-6 py-3 mt-8 inline-block">Volver al inicio de sesión</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Recuperar acceso" subtitle="NEONEXA · RECUPERAR">
      <p className="text-white/60 text-sm -mt-4 mb-6">Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.</p>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="recover-email" className="text-xs uppercase tracking-widest text-white/60">Email</label>
          <input id="recover-email" className={inputClass + ' mt-2'} type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoFocus/>
        </div>
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        <button disabled={loading} className="nx-btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2">
          {loading && <Loader2 className="animate-spin" size={16}/>} Enviar enlace
        </button>
      </form>
      <div className="mt-6 text-sm text-white/60">
        <Link to="/login" className="text-[#00F0FF]">Volver al inicio de sesión</Link>
      </div>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const { confirmPasswordReset } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Shell title="Enlace inválido" subtitle="NEONEXA · RESTABLECER">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#FF2D95]/20 flex items-center justify-center mx-auto"><AlertTriangle size={30} className="text-[#FF2D95]"/></div>
          <p className="text-white/65 mt-6">Este enlace está incompleto. Pide uno nuevo desde la pantalla de recuperación.</p>
          <Link to="/recuperar" className="nx-btn-primary px-6 py-3 mt-8 inline-block">Pedir enlace nuevo</Link>
        </div>
      </Shell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setErr('Las contraseñas no coinciden.'); return; }
    setErr(''); setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch {
      setErr('El enlace ya venció o no es válido. Pide uno nuevo.');
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <Shell title="Contraseña cambiada" subtitle="NEONEXA · RESTABLECER">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#3ddc84]/20 flex items-center justify-center mx-auto"><Check size={30} className="text-[#3ddc84]"/></div>
          <p className="text-white/65 mt-6">Ya puedes entrar con tu contraseña nueva.</p>
          <button onClick={() => nav('/login')} className="nx-btn-primary px-6 py-3 mt-8 inline-block">Iniciar sesión</button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Nueva contraseña" subtitle="NEONEXA · RESTABLECER">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-pass" className="text-xs uppercase tracking-widest text-white/60">Contraseña nueva</label>
          <input id="new-pass" className={inputClass + ' mt-2'} type="password" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} autoFocus/>
          <p className="text-white/40 text-xs mt-2">Mínimo 8 caracteres.</p>
        </div>
        <div>
          <label htmlFor="new-pass-2" className="text-xs uppercase tracking-widest text-white/60">Repite la contraseña</label>
          <input id="new-pass-2" className={inputClass + ' mt-2'} type="password" required minLength={8}
            value={confirm} onChange={(e) => setConfirm(e.target.value)}/>
        </div>
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        <button disabled={loading} className="nx-btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2">
          {loading && <Loader2 className="animate-spin" size={16}/>} Guardar contraseña
        </button>
      </form>
    </Shell>
  );
}

export function RegisterPage() {
  const { signup, isAuthed } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', company: '', rfc: '' });
  const [terms, setTerms] = useState(false);
  const [showOpt, setShowOpt] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const strong = f.password.length >= 8 && /[A-Za-z]/.test(f.password) && /\d/.test(f.password);
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!terms) { setErr('Debes aceptar los términos y condiciones.'); return; }
    if (!strong) { setErr('La contraseña debe tener 8+ caracteres, letras y números.'); return; }
    setLoading(true);
    try { await signup(f); nav('/dashboard'); }
    catch (ex) { setErr(ex?.response?.data?.email?.message || ex?.message || 'No se pudo crear la cuenta.'); }
    finally { setLoading(false); }
  };
  return (
    <Shell title="Crear cuenta" subtitle="NEONEXA · REGISTRO">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-widest text-white/60">Nombre completo</label>
          <input className={inputClass+' mt-2'} required value={f.name} onChange={set('name')} placeholder="Tu nombre o marca"/>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/60">Email</label>
          <input className={inputClass+' mt-2'} type="email" required value={f.email} onChange={set('email')} placeholder="tu@correo.com"/>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/60">Teléfono / WhatsApp</label>
          <input className={inputClass+' mt-2'} type="tel" required value={f.phone} onChange={set('phone')} placeholder="+52 55 0000 0000"/>
        </div>
        <div>
          <label htmlFor="register-password" className="text-xs uppercase tracking-widest text-white/60">Contraseña segura</label>
          <input id="register-password" className={inputClass+' mt-2'} type="password" required minLength={8} value={f.password} onChange={set('password')}
            aria-invalid={f.password ? !strong : undefined} aria-describedby={f.password && !strong ? 'register-password-hint' : undefined}/>
          {f.password && !strong && <div id="register-password-hint" className="text-[#FFD400] text-xs mt-1">Usa 8+ caracteres con letras y números.</div>}
        </div>
        <button type="button" onClick={()=>setShowOpt(s=>!s)} className="text-[#00F0FF] text-xs uppercase tracking-widest">
          {showOpt ? '− Ocultar' : '+ Datos de facturación (opcional)'}
        </button>
        {showOpt && (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-white/60">Empresa</label>
              <input className={inputClass+' mt-2'} value={f.company} onChange={set('company')} placeholder="Razón social"/>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-white/60">RFC</label>
              <input className={inputClass+' mt-2'} value={f.rfc} onChange={set('rfc')} placeholder="XAXX010101000"/>
            </div>
          </div>
        )}
        <label htmlFor="register-terms" className="flex items-start gap-3 text-sm text-white/70 cursor-pointer">
          <input id="register-terms" type="checkbox" checked={terms} onChange={e=>setTerms(e.target.checked)} className="mt-1 accent-[#00AEEF]"/>
          <span>Acepto los <Link to="/terminos" target="_blank" className="text-[#00F0FF]">términos y condiciones</Link> y el <Link to="/privacidad" target="_blank" className="text-[#00F0FF]">aviso de privacidad</Link> de Neonexa.</span>
        </label>
        {err && <div id="register-error" role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        <button disabled={loading} className="nx-btn-primary w-full py-3 mt-2 flex items-center justify-center gap-2">
          {loading && <Loader2 className="animate-spin" size={16}/>} Crear cuenta
        </button>
      </form>
      <div className="mt-6 text-sm text-white/60">
        ¿Ya tienes cuenta? <Link to="/login" className="text-[#00F0FF]">Entrar</Link>
      </div>
    </Shell>
  );
}
