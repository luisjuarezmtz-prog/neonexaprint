import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { money } from '@/lib/neonexa';
import { ArrowRight, Loader2, Package } from 'lucide-react';

export const CATEGORIES = [
  { id: 'playeras', label: 'Playeras' },
  { id: 'gorras', label: 'Gorras' },
  { id: 'termos', label: 'Termos' },
  { id: 'tazas', label: 'Tazas' },
  { id: 'bolsas', label: 'Bolsas' },
  { id: 'regalos_empresariales', label: 'Regalos empresariales' },
  { id: 'kits_corporativos', label: 'Kits corporativos' },
  { id: 'proyectos_especiales', label: 'Proyectos especiales' },
];

export default function Personalizados() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('todos');

  useEffect(() => {
    pb.collection('products').getFullList({ filter: 'active = true', sort: 'category' })
      .then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => cat === 'todos' ? products : products.filter(p => p.category === cat),
    [products, cat]);

  return (
    <PageShell>
      <section className="max-w-[90rem] mx-auto px-6 pt-16 pb-8">
        <div className="font-display tracking-[0.5em] text-[#FF2D95] text-xs">NEONEXA PERSONALIZADOS</div>
        <h1 className="font-display text-5xl md:text-7xl font-black mt-3 uppercase">Tu marca<br/><span className="nx-stroke-text">en cada detalle</span></h1>
        <p className="mt-6 max-w-xl text-white/65">Elige un producto, define variantes, sube tu diseño o pide apoyo creativo. Cotización automática o a medida para kits y proyectos especiales.</p>
      </section>

      <section className="max-w-[90rem] mx-auto px-6 pb-6 flex flex-wrap gap-2">
        {[{ id: 'todos', label: 'Todos' }, ...CATEGORIES].map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={`px-4 py-2 font-display text-xs uppercase tracking-widest rounded-full border transition ${cat === c.id ? 'border-[#00F0FF] text-[#00F0FF] bg-[#00AEEF]/10' : 'border-white/15 text-white/60 hover:text-white'}`}>
            {c.label}
          </button>
        ))}
      </section>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div> : (
        <section className="max-w-[90rem] mx-auto px-6 pb-24 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.length === 0 && <div className="nx-card p-12 text-center text-white/50 col-span-full">No hay productos en esta categoría.</div>}
          {filtered.map(p => (
            <Link key={p.id} to={`/personalizados/${p.slug}`} className="nx-card overflow-hidden group block">
              <div className="aspect-[4/3] relative overflow-hidden bg-black/40">
                {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/> : <div className="w-full h-full flex items-center justify-center"><Package size={48} className="text-white/20"/></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent"/>
                <span className="absolute top-3 left-3 px-2 py-1 text-[10px] font-display tracking-widest bg-[#0B0B0B]/80 text-[#00F0FF] border border-[#00F0FF]/30">{CATEGORIES.find(c => c.id === p.category)?.label || p.category}</span>
              </div>
              <div className="p-6">
                <div className="font-display font-bold text-xl uppercase">{p.name}</div>
                <div className="font-display text-[#00F0FF] mt-1">{p.quote_only ? 'Cotización a medida' : `desde ${money(p.base_price, 'MXN')}`}</div>
                <p className="text-white/60 text-sm mt-3 line-clamp-2">{p.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 font-display text-xs tracking-[0.3em] uppercase text-white group-hover:text-[#00F0FF]">
                  {p.quote_only ? 'Solicitar cotización' : 'Personalizar'} <ArrowRight size={14}/>
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </PageShell>
  );
}
