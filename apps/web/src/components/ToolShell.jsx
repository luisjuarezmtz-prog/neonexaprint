import React from 'react';
import { Link } from 'react-router-dom';
import PageShell from './PageShell';
import { useAuth } from '@/lib/auth';
import { useMembership } from '@/lib/membership';
import { Lock, Loader2, Crown } from 'lucide-react';

export default function ToolShell({ eyebrow, title, subtitle, children, sidebar }) {
  const { isAuthed } = useAuth();
  const { loading, allowed } = useMembership();

  const gated = (
    <div className="max-w-2xl mx-auto text-center py-20">
      <div className="w-16 h-16 rounded-full bg-[#00AEEF]/15 flex items-center justify-center mx-auto"><Lock size={30} className="text-[#00F0FF]"/></div>
      <h2 className="font-display text-4xl font-black uppercase mt-6">Acceso a Neonexa Tools</h2>
      <p className="text-white/60 mt-3">
        {isAuthed
          ? 'Necesitas una membresía vigente para usar las herramientas. Suscríbete o renueva para desbloquear el acceso.'
          : 'Inicia sesión y activa tu membresía para usar el estudio de mockups, preparación de impresión y semitonos.'}
      </p>
      <div className="flex gap-3 justify-center mt-8 flex-wrap">
        <Link to="/membresias" className="nx-btn-primary px-6 py-3 inline-flex items-center gap-2"><Crown size={16}/>Ver membresías</Link>
        {!isAuthed && <Link to="/login" className="nx-btn-ghost px-6 py-3">Iniciar sesión</Link>}
      </div>
    </div>
  );

  return (
    <PageShell>
      <div className="max-w-[100rem] mx-auto px-6 pt-10 pb-20">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">{eyebrow}</div>
        <h1 className="font-display text-4xl md:text-5xl font-black mt-2 uppercase">{title}</h1>
        {subtitle && <p className="text-white/60 mt-2 max-w-2xl">{subtitle}</p>}
        {loading ? (
          <div className="py-32 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div>
        ) : !allowed ? gated : (
          <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-6">
            <div className="nx-card p-4 md:p-6 min-h-[500px]">{children}</div>
            <aside className="nx-card p-6 self-start lg:sticky lg:top-24">{sidebar}</aside>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export const labelCls = "block text-[11px] uppercase tracking-[0.2em] text-white/60 mb-2";
export const inputCls = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF] focus:ring-1 focus:ring-[#00F0FF]/40";
export const rangeCls = "w-full accent-[#00F0FF]";
