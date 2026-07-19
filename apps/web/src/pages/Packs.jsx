import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { money } from '@/lib/neonexa';
import { ArrowRight, Loader2, Images, Search } from 'lucide-react';

export const PACK_CATEGORIES = [
  { id: 'temporadas', label: 'Temporadas / fechas especiales' },
  { id: 'oficios', label: 'Profesiones / oficios' },
  { id: 'deportes', label: 'Deportes' },
  { id: 'frases', label: 'Frases / tipografía' },
  { id: 'infantiles', label: 'Infantiles' },
  { id: 'estilos', label: 'Estilos gráficos' },
  { id: 'nichos', label: 'Nichos comerciales' },
  { id: 'tendencias', label: 'Tendencias' },
];

export function effectivePrice(pack) {
  const now = new Date();
  const start = pack.promo_start ? new Date(pack.promo_start) : null;
  const end = pack.promo_end ? new Date(pack.promo_end) : null;
  const promoActive = pack.promo_price > 0 && (!start || now >= start) && (!end || now <= end);
  return { price: promoActive ? pack.promo_price : pack.price, onPromo: promoActive, original: pack.price };
}

export default function Packs() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('todos');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('novedad');

  useEffect(() => {
    pb.collection('image_packs').getFullList({ filter: 'status = "publicado"', sort: '-created' })
      .then(setPacks).catch(() => setPacks([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = cat === 'todos' ? packs : packs.filter(p => p.category === cat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(needle) ||
        p.subcategory?.toLowerCase().includes(needle) ||
        (p.tags || []).some(t => t.toLowerCase().includes(needle)));
    }
    list = [...list];
    if (sort === 'precio_asc') list.sort((a, b) => effectivePrice(a).price - effectivePrice(b).price);
    else if (sort === 'precio_desc') list.sort((a, b) => effectivePrice(b).price - effectivePrice(a).price);
    // 'novedad' keeps the -created order already fetched
    return list;
  }, [packs, cat, q, sort]);

  return (
    <PageShell>
      <Helmet>
        <title>Packs de diseños DTF listos para imprimir — Neonexa Print</title>
        <meta name="description" content="Packs de imágenes DTF por paquete completo, fondo transparente y alta resolución con licencia clara. Agrégalos directo a tu pedido de DTF Textil o UV." />
      </Helmet>
      <section className="max-w-[90rem] mx-auto px-6 pt-16 pb-8">
        <div className="font-display tracking-[0.5em] text-[#FF2D95] text-xs">BIBLIOTECA DE IMÁGENES</div>
        <h1 className="font-display text-5xl md:text-7xl font-black mt-3 uppercase">Packs listos<br/><span className="nx-stroke-text">para imprimir</span></h1>
        <p className="mt-6 max-w-xl text-white/65">Diseños DTF por paquete completo — fondo transparente, alta resolución, licencia clara. Agrega cualquier imagen de tus packs directo a un pedido de DTF Textil o UV.</p>
      </section>

      <section className="max-w-[90rem] mx-auto px-6 pb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por palabra clave, estilo, temporada…"
            className="w-full bg-black/50 border border-[#00AEEF]/30 pl-9 pr-3 py-2.5 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]"/>
        </div>
        <select value={sort} onChange={e => setSort(e.target.value)} className="bg-black/50 border border-[#00AEEF]/30 px-3 py-2.5 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]">
          <option value="novedad">Más nuevos</option>
          <option value="precio_asc">Precio: menor a mayor</option>
          <option value="precio_desc">Precio: mayor a menor</option>
        </select>
      </section>

      <section className="max-w-[90rem] mx-auto px-6 pb-6 flex flex-wrap gap-2">
        {[{ id: 'todos', label: 'Todos' }, ...PACK_CATEGORIES].map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={`px-4 py-2 font-display text-xs uppercase tracking-widest rounded-full border transition ${cat === c.id ? 'border-[#00F0FF] text-[#00F0FF] bg-[#00AEEF]/10' : 'border-white/15 text-white/60 hover:text-white'}`}>
            {c.label}
          </button>
        ))}
      </section>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div> : (
        <section className="max-w-[90rem] mx-auto px-6 pb-24 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.length === 0 && <div className="nx-card p-12 text-center text-white/50 col-span-full">No hay packs en esta búsqueda todavía.</div>}
          {filtered.map(p => {
            const { price, onPromo, original } = effectivePrice(p);
            return (
              <Link key={p.id} to={`/packs/${p.slug}`} className="nx-card overflow-hidden group block">
                <div className="aspect-[4/3] relative overflow-hidden bg-black/40">
                  {p.cover ? <img src={pb.files.getUrl(p, p.cover)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/> : <div className="w-full h-full flex items-center justify-center"><Images size={48} className="text-white/20"/></div>}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent"/>
                  <span className="absolute top-3 left-3 px-2 py-1 text-[10px] font-display tracking-widest bg-[#0B0B0B]/80 text-[#00F0FF] border border-[#00F0FF]/30">{PACK_CATEGORIES.find(c => c.id === p.category)?.label || p.category}</span>
                </div>
                <div className="p-6">
                  <div className="font-display font-bold text-xl uppercase">{p.name}</div>
                  <div className="text-white/50 text-xs mt-1">{p.item_count} diseños · {(p.formats || []).join(', ').toUpperCase()}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {onPromo && <span className="text-white/40 text-sm line-through">{money(original, 'MXN')}</span>}
                    <span className="font-display text-[#00F0FF] text-lg">{money(price, 'MXN')}</span>
                  </div>
                  <p className="text-white/60 text-sm mt-3 line-clamp-2">{p.short_description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 font-display text-xs tracking-[0.3em] uppercase text-white group-hover:text-[#00F0FF]">
                    Ver pack <ArrowRight size={14}/>
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </PageShell>
  );
}
