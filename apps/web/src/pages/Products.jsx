import React from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { ArrowRight } from 'lucide-react';

const PRODUCTS = [
  { name: 'Playera Premium DTF', price: 'desde $189', desc: 'Algodón 180g, impresión a todo color con blanco.', tag: 'BESTSELLER', img: 'https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png', color: '#00AEEF' },
  { name: 'Playera Blanca DTF', price: 'desde $169', desc: 'Tela 100% algodón, impresión vívida y duradera.', img: 'https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png', color: '#00F0FF' },
  { name: 'DTF por Metro', price: '$320 / m', desc: 'Gang sheet personalizado. Tú diseñas, nosotros imprimimos.', img: 'https://images.hostinger.com/46dc9591-c52a-48f3-8f24-c11c77860d4c.png', color: '#FF2D95' },
  { name: 'Taza Personalizada', price: '$129', desc: 'Sublimación premium, brillo antirayaduras.', img: 'https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png', color: '#FFD400' },
  { name: 'Termo 600ml', price: '$249', desc: 'Acero inoxidable, conserva 12h frío / 6h caliente.', img: 'https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png', color: '#00AEEF' },
  { name: 'Kit Corporativo', price: 'cotización', desc: 'Playera + termo + sticker en caja premium.', img: 'https://images.hostinger.com/46dc9591-c52a-48f3-8f24-c11c77860d4c.png', color: '#00F0FF' },
];

export default function Products() {
  return (
    <PageShell>
      <section className="relative max-w-[90rem] mx-auto px-6 pt-20 pb-12">
        <div className="font-display tracking-[0.5em] text-[#00F0FF] text-xs">CATÁLOGO NEONEXA</div>
        <h1 className="font-display text-6xl md:text-7xl font-black mt-3 uppercase">Productos<br/><span className="nx-stroke-text">personalizables</span></h1>
        <p className="mt-6 max-w-xl text-white/65">Cada producto puede llevar tu arte vía DTF o UV. Diseña con nuestras herramientas y cotiza al instante.</p>
      </section>

      <section className="max-w-[90rem] mx-auto px-6 pb-24 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {PRODUCTS.map((p, i) => (
          <div key={p.name} className="nx-card overflow-hidden group">
            <div className="aspect-[4/3] relative overflow-hidden">
              <img src={p.img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/>
              {p.tag && <span className="absolute top-3 left-3 px-2 py-1 text-[10px] font-display tracking-widest bg-[#FFD400] text-black">{p.tag}</span>}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent"/>
            </div>
            <div className="p-6">
              <div className="font-display font-bold text-xl uppercase">{p.name}</div>
              <div className="font-display text-[#00F0FF] mt-1">{p.price}</div>
              <p className="text-white/60 text-sm mt-3">{p.desc}</p>
              <Link to="/tools/mockup" className="mt-5 inline-flex items-center gap-2 font-display text-xs tracking-[0.3em] uppercase text-white hover:text-[#00F0FF]">
                Personalizar <ArrowRight size={14}/>
              </Link>
            </div>
            <div className="h-1" style={{background:p.color}}/>
          </div>
        ))}
      </section>
    </PageShell>
  );
}
