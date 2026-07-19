import React from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useMembership } from '@/lib/membership';
import { TOOLS } from '@/lib/tools';
import {
  ScanSearch, Calculator, LayoutGrid, Eraser, Sparkles, PenTool,
  Wand2, CircleDot, Shirt, FileCog, Lock, Crown, ArrowRight,
} from 'lucide-react';

const ICONS = {
  inspector: ScanSearch, calculadora: Calculator, 'gang-sheet': LayoutGrid,
  'background-remover': Eraser, upscaler: Sparkles, vectorizer: PenTool,
  'transparency-cleaner': Wand2, 'halftone-smart': CircleDot,
  'shirt-simulator': Shirt, 'rip-preparer': FileCog,
};

export default function ToolsHub() {
  const { allowed, loading } = useMembership();
  return (
    <PageShell>
      <div className="max-w-[90rem] mx-auto px-6 pt-14 pb-24">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">NEONEXA TOOLS</div>
        <h1 className="font-display text-5xl md:text-6xl font-black mt-3 uppercase">10 herramientas <span className="text-[#00AEEF]">DTF pro</span></h1>
        <p className="text-white/60 mt-4 max-w-2xl">Inspecciona, cotiza, acomoda, limpia, vectoriza y prepara tus diseños para impresión. El acceso depende de tu plan de membresía activo.</p>

        {!loading && !allowed && (
          <div className="nx-card p-5 mt-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-white/70"><Lock size={18} className="text-[#FFD400]"/>Necesitas una membresía activa para usar las herramientas.</div>
            <Link to="/membresias" className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2"><Crown size={16}/>Ver membresías</Link>
          </div>
        )}

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((t) => {
            const Icon = ICONS[t.slug] || Sparkles;
            return (
              <Link key={t.slug} to={`/tools/${t.slug}`} className="nx-card p-6 group hover:border-[#00F0FF]/50 transition relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-lg bg-[#00AEEF]/15 flex items-center justify-center"><Icon className="text-[#00F0FF]" size={24}/></div>
                  <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full" style={{ color: t.priority === 1 ? '#FFD400' : '#00AEEF', background: (t.priority === 1 ? '#FFD400' : '#00AEEF') + '18' }}>P{t.priority}</span>
                </div>
                <div className="font-display text-lg font-bold mt-4 uppercase leading-tight">{t.name}</div>
                <p className="text-white/55 text-sm mt-2">{t.desc}</p>
                <div className="mt-4 text-[#00AEEF] text-sm inline-flex items-center gap-1 group-hover:gap-2 transition-all">Abrir <ArrowRight size={14}/></div>
              </Link>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}
