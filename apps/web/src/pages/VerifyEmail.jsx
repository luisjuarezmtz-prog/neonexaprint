import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { Loader2, Check, AlertTriangle } from 'lucide-react';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token');
  const [status, setStatus] = useState('checking'); // checking | ok | error

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    pb.collection('users').confirmVerification(token)
      .then(async () => {
        // confirmVerification() doesn't update the cached session record, so
        // the dashboard/checkout banners would keep nagging an already-verified user.
        if (pb.authStore.isValid) { try { await pb.collection('users').authRefresh(); } catch { /* ignore */ } }
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <PageShell hideFooter>
      <div className="min-h-[calc(100dvh-80px)] flex items-center justify-center px-6 py-16 relative overflow-hidden">
        <div className="absolute inset-0 nx-grid-bg opacity-50"/>
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[#00AEEF]/15 blur-[140px]"/>
        <div className="relative w-full max-w-md nx-card p-10 text-center">
          {status === 'checking' && (
            <>
              <Loader2 className="animate-spin text-[#00AEEF] mx-auto" size={40}/>
              <h1 className="font-display text-2xl font-black mt-6 uppercase">Verificando…</h1>
            </>
          )}
          {status === 'ok' && (
            <>
              <div className="w-16 h-16 rounded-full bg-[#3ddc84]/20 flex items-center justify-center mx-auto"><Check size={32} className="text-[#3ddc84]"/></div>
              <h1 className="font-display text-3xl font-black mt-6 uppercase">Correo verificado</h1>
              <p className="text-white/65 mt-3">Tu cuenta ya está confirmada.</p>
              <button onClick={() => nav('/dashboard')} className="nx-btn-primary px-6 py-3 mt-8 inline-block">Ir a mi panel</button>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-[#FF2D95]/20 flex items-center justify-center mx-auto"><AlertTriangle size={32} className="text-[#FF2D95]"/></div>
              <h1 className="font-display text-3xl font-black mt-6 uppercase">Enlace inválido</h1>
              <p className="text-white/65 mt-3">Este enlace de verificación ya expiró o no es válido. Puedes pedir uno nuevo desde tu panel.</p>
              <Link to="/dashboard" className="nx-btn-ghost px-6 py-3 mt-8 inline-block">Ir a mi panel</Link>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
