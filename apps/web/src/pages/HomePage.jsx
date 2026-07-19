import React from 'react';
import { Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { ArrowRight, Shirt, Layers, Printer, Sparkles, Coffee, Gift, Tag, UploadCloud, Wrench, Star, Plus, Minus } from 'lucide-react';
import { useState } from 'react';

const HERO_IMG = 'https://images.hostinger.com/0e0d1e7f-2997-4aff-ac10-2a6ca99e6f71.png';
const DTF_IMG = 'https://images.hostinger.com/46dc9591-c52a-48f3-8f24-c11c77860d4c.png';
const TSHIRT_BLACK = 'https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png';
const TSHIRT_WHITE = 'https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png';

const PALETTE = [
  { hex: '#0B0B0B', label: '#0B0B0B' },
  { hex: '#00AEEF', label: '#00AEEF' },
  { hex: '#00F0FF', label: '#00F0FF' },
  { hex: '#FFFFFF', label: '#FFFFFF' },
  { hex: '#FF2D95', label: '#FF2D95' },
  { hex: '#FFD400', label: '#FFD400' },
];

const SERVICES = [
  { icon: Layers, label: 'DTF por metro' },
  { icon: Shirt, label: 'Playeras personalizadas' },
  { icon: Shirt, label: 'Uniformes empresariales' },
  { icon: Coffee, label: 'Tazas personalizadas' },
  { icon: Coffee, label: 'Termos personalizados' },
  { icon: Gift, label: 'Kits corporativos' },
  { icon: Tag, label: 'UV DTF stickers' },
];

const TOOLS = [
  {
    to: '/tools/mockup',
    title: 'Mockup Studio',
    sub: 'Coloca tu diseño sobre una playera real, ajusta escala y posición, exporta tu mockup en segundos.',
    icon: Shirt,
    color: '#00AEEF',
  },
  {
    to: '/tools/print',
    title: 'Preparar para DTF',
    sub: 'Encuadra a tamaño real (cm), agrega sangrado, espeja en horizontal y descarga listo para imprimir.',
    icon: Printer,
    color: '#00F0FF',
  },
  {
    to: '/tools/halftone',
    title: 'Conversor de Semitonos',
    sub: 'Convierte cualquier imagen a patrón de puntos en tiempo real. Ajusta tamaño, ángulo y contraste.',
    icon: Sparkles,
    color: '#FF2D95',
  },
];

function Faq() {
  const items = [
    ['¿Qué formatos aceptan?', 'PNG, JPG, PDF, TIFF y SVG. Recomendamos PNG con fondo transparente a 300 DPI.'],
    ['¿Cuánto tarda la producción?', 'De 24 a 72 horas según el volumen. Recibirás notificación en cada etapa.'],
    ['¿Puedo reusar mis archivos?', 'Sí. Tus archivos quedan guardados de forma privada en tu panel para futuros pedidos.'],
    ['¿Hacen factura?', 'Sí, puedes solicitar CFDI durante el checkout con tus datos fiscales.'],
  ];
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map(([q, a], i) => (
        <div key={i} className="nx-card overflow-hidden">
          <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center justify-between gap-4 p-5 text-left">
            <span className="font-display uppercase tracking-wide text-sm">{q}</span>
            {open === i ? <Minus size={18} className="text-[#00F0FF] shrink-0"/> : <Plus size={18} className="text-[#00AEEF] shrink-0"/>}
          </button>
          {open === i && <div className="px-5 pb-5 text-white/65 text-sm">{a}</div>}
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <PageShell>
      {/* HERO */}
      <section className="relative overflow-hidden min-h-[100dvh] flex items-center">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover opacity-40"/>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0B]/50 via-[#0B0B0B]/85 to-[#0B0B0B]"/>
          <div className="absolute inset-0 nx-grid-bg opacity-60"/>
          <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#00AEEF]/20 blur-[120px]"/>
          <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#FF2D95]/15 blur-[120px]"/>
        </div>

        <div className="relative max-w-[90rem] mx-auto px-6 py-32 grid lg:grid-cols-[1.3fr_1fr] gap-12 items-center w-full">
          <div className="nx-rise">
            <div className="font-display tracking-[0.45em] text-[#00F0FF] text-xs mb-6">CDMX · DTF · UV · TEXTIL</div>
            <h1 className="font-display font-black text-[clamp(3rem,9vw,8rem)] leading-[0.9] uppercase">
              <span className="block">Color</span>
              <span className="block text-[#00AEEF] nx-glow">que vende.</span>
              <span className="block nx-stroke-text">Hecho en neón.</span>
            </h1>
            <p className="mt-8 max-w-xl text-white/70 text-lg leading-relaxed">
              Neonexa Print convierte tus ideas en prendas, kits y stickers con impresión DTF y UV de alta adherencia.
              Crea, ajusta e imprime — todo desde el navegador.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/dtf/textil" className="nx-btn-primary px-7 py-4 inline-flex items-center gap-3">
                <UploadCloud size={18}/> Sube tu archivo
              </Link>
              <Link to="/tools/mockup" className="nx-btn-ghost px-7 py-4 inline-flex items-center gap-3">
                Conoce Neonexa Tools <ArrowRight size={18}/>
              </Link>
            </div>
            <div className="mt-12 grid grid-cols-3 max-w-md gap-6">
              {[['+5K','prendas/mes'],['72h','entrega'],['CMYK+W','tinta DTF']].map(([k,v]) => (
                <div key={k}>
                  <div className="font-display text-3xl font-bold text-[#00F0FF]">{k}</div>
                  <div className="text-xs text-white/50 uppercase tracking-widest mt-1">{v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 grid grid-cols-2 gap-4 -rotate-3">
              <img src={TSHIRT_BLACK} className="rounded aspect-square object-cover shadow-2xl shadow-[#00AEEF]/30 border border-[#00AEEF]/30" alt=""/>
              <img src={DTF_IMG} className="rounded aspect-square object-cover mt-12 shadow-2xl shadow-[#FF2D95]/20 border border-[#FF2D95]/20" alt=""/>
              <img src={TSHIRT_WHITE} className="rounded aspect-square object-cover -mt-6 col-span-2 max-w-[60%] mx-auto shadow-2xl shadow-[#00F0FF]/30 border border-[#00F0FF]/30" alt=""/>
            </div>
            <div className="invisible aspect-[3/4]"/>
          </div>
        </div>

        {/* marquee bottom */}
        <div className="absolute bottom-0 inset-x-0 border-y border-[#00AEEF]/20 bg-[#0B0B0B]/90 backdrop-blur overflow-hidden">
          <div className="nx-marquee py-4 font-display tracking-[0.4em] text-sm uppercase text-white/80">
            {Array.from({length:2}).map((_,k) => (
              <div key={k} className="flex gap-12 shrink-0">
                {['DTF por metro','Playeras personalizadas','Uniformes empresariales','Tazas y termos','Kits corporativos','UV DTF stickers','Color que vende','Hecho en CDMX'].map(s => (
                  <span key={s} className="flex items-center gap-12">{s} <span className="text-[#00F0FF]">◆</span></span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick access */}
      <section className="max-w-[90rem] mx-auto px-6 pt-24 -mb-8">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs mb-8">ACCESOS RÁPIDOS</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { to:'/dtf/textil', icon:Layers, color:'#00AEEF', t:'DTF Textil', d:'Cotiza por metro al instante' },
            { to:'/dtf/uv', icon:Sparkles, color:'#FF2D95', t:'DTF UV', d:'Superficies rígidas y stickers' },
            { to:'/productos', icon:Gift, color:'#FFD400', t:'Personalizados', d:'Playeras, tazas y kits' },
            { to:'/tools/mockup', icon:Wrench, color:'#00F0FF', t:'Neonexa Tools', d:'Editores en el navegador' },
          ].map(({to,icon:Icon,color,t,d}) => (
            <Link key={to} to={to} className="group nx-card p-6 hover:-translate-y-1 transition-transform relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-25" style={{background:color}}/>
              <Icon size={30} style={{color}}/>
              <div className="font-display text-xl font-bold uppercase mt-4 tracking-wide">{t}</div>
              <div className="text-white/55 text-sm mt-1">{d}</div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[#00F0FF] group-hover:gap-3 transition-all">Entrar <ArrowRight size={13}/></div>
            </Link>
          ))}
        </div>
      </section>

      {/* Services strip */}
      <section className="max-w-[90rem] mx-auto px-6 py-24">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {SERVICES.map(({icon:Icon,label}, i) => (
            <div key={label} className="nx-card p-5 flex flex-col items-center text-center gap-3 hover:border-[#00F0FF]/50 transition-colors">
              <div className="w-12 h-12 rounded-full border border-[#00AEEF]/50 flex items-center justify-center text-[#00F0FF]">
                <Icon size={22}/>
              </div>
              <div className="font-display text-[11px] tracking-[0.18em] uppercase leading-tight">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="max-w-[90rem] mx-auto px-6 py-16">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
          <div>
            <div className="font-display tracking-[0.4em] text-[#00AEEF] text-xs">HERRAMIENTAS EN VIVO</div>
            <h2 className="font-display text-5xl md:text-6xl font-black mt-3 uppercase">Diseña ahora.<br/><span className="text-[#00F0FF]">Imprime después.</span></h2>
          </div>
          <p className="max-w-md text-white/60">Tres editores que viven en tu navegador. Sube tu arte, ajusta cada detalle y descarga el archivo listo o pásalo a producción.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {TOOLS.map(({to,title,sub,icon:Icon,color}, i) => (
            <Link key={to} to={to} className="group nx-card p-7 relative overflow-hidden hover:-translate-y-1 transition-transform">
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-30" style={{background:color}}/>
              <Icon size={34} style={{color}}/>
              <h3 className="font-display text-2xl font-bold mt-6 uppercase tracking-wide">{title}</h3>
              <p className="text-white/60 mt-3 leading-relaxed">{sub}</p>
              <div className="mt-6 inline-flex items-center gap-2 font-display text-xs tracking-[0.3em] uppercase text-[#00F0FF] group-hover:gap-3 transition-all">
                Abrir editor <ArrowRight size={14}/>
              </div>
              <div className="absolute bottom-0 left-0 h-[2px] w-0 group-hover:w-full transition-all duration-500" style={{background:color}}/>
            </Link>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="max-w-[90rem] mx-auto px-6 py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1 grid grid-cols-2 gap-4">
            <img src={DTF_IMG} className="rounded col-span-2 aspect-[16/10] object-cover border border-[#00AEEF]/30" alt="DTF impresión"/>
            <img src={TSHIRT_BLACK} className="rounded aspect-square object-cover border border-white/10" alt=""/>
            <img src={TSHIRT_WHITE} className="rounded aspect-square object-cover border border-white/10" alt=""/>
          </div>
          <div className="order-1 lg:order-2">
            <div className="font-display tracking-[0.4em] text-[#FFD400] text-xs">PROCESO</div>
            <h2 className="font-display text-5xl font-black mt-3 uppercase">Del diseño<br/>al algodón.</h2>
            <ol className="mt-10 space-y-6">
              {[
                ['01','Sube tu arte','PNG, JPG o crea desde nuestros editores.'],
                ['02','Ajusta y previsualiza','Mockup en playera, tamaño real, semitono o trazo.'],
                ['03','Confirma producción','DTF en CMYK + blanco con máxima adherencia.'],
                ['04','Recíbelo en 72h','Entregas en CDMX y área metropolitana.'],
              ].map(([n,t,d]) => (
                <li key={n} className="flex gap-5">
                  <div className="font-display text-3xl font-black text-[#00AEEF] w-12 shrink-0">{n}</div>
                  <div>
                    <div className="font-display font-bold uppercase tracking-wider">{t}</div>
                    <div className="text-white/60 mt-1">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Palette + Typography */}
      <section className="max-w-[90rem] mx-auto px-6 py-20 grid lg:grid-cols-2 gap-10">
        <div className="nx-card p-10">
          <div className="font-display tracking-[0.4em] text-[#00AEEF] text-xs">PALETA DE COLORES</div>
          <div className="mt-8 grid grid-cols-6 gap-3">
            {PALETTE.map(c => (
              <div key={c.hex} className="text-center">
                <div className="aspect-square rounded border border-white/10 shadow-lg" style={{background:c.hex}}/>
                <div className="font-mono text-[10px] mt-2 text-white/60">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="nx-card p-10">
          <div className="font-display tracking-[0.4em] text-[#00AEEF] text-xs">TIPOGRAFÍA</div>
          <div className="mt-6 font-display font-black text-7xl">EXO 2</div>
          <div className="font-display tracking-[0.6em] text-sm text-white/60 mt-1">B O L D</div>
          <div className="mt-6 font-display tracking-[0.18em] text-white/80 text-lg">
            ABCDEFGHIJKLMN<br/>OPQRSTUVWXYZ<br/>0123456789
          </div>
        </div>
      </section>

      {/* Testimonios + Planes */}
      <section className="max-w-[90rem] mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
          <div>
            <div className="font-display tracking-[0.4em] text-[#00AEEF] text-xs">LO QUE DICEN</div>
            <h2 className="font-display text-4xl font-black uppercase mt-3 mb-8">Marcas que confían</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                ['La calidad del DTF es brutal, los colores no se despintan.','Andrea R.','Marca de streetwear'],
                ['Cotización clara y entrega en tiempo. Ya es mi proveedor fijo.','Marco T.','Uniformes'],
                ['El panel me deja reusar mis archivos, súper práctico.','Lucía M.','Emprendedora'],
                ['UV DTF perfecto para mis stickers de termos.','Diego P.','Regalos corporativos'],
              ].map(([q,n,r],i)=>(
                <div key={i} className="nx-card p-6">
                  <div className="flex gap-1 text-[#FFD400] mb-3">{Array.from({length:5}).map((_,k)=><Star key={k} size={14} fill="#FFD400"/>)}</div>
                  <p className="text-white/80">“{q}”</p>
                  <div className="mt-4 text-sm"><span className="font-semibold">{n}</span> <span className="text-white/40">· {r}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="font-display tracking-[0.4em] text-[#FFD400] text-xs">PLANES</div>
            <h2 className="font-display text-4xl font-black uppercase mt-3 mb-8">Precios claros</h2>
            <div className="space-y-4">
              {[
                ['DTF Textil 1–4 m','$200','MXN / metro'],
                ['DTF Textil 5+ m','$180','MXN / metro'],
                ['DTF UV por hoja','desde $85','MXN / hoja'],
              ].map(([t,p,u],i)=>(
                <div key={i} className="nx-card p-5 flex items-center justify-between">
                  <div className="font-display uppercase tracking-wide text-sm">{t}</div>
                  <div className="text-right"><div className="font-display text-2xl font-black text-[#00AEEF]">{p}</div><div className="text-[10px] uppercase tracking-widest text-white/40">{u}</div></div>
                </div>
              ))}
              <Link to="/dtf/textil" className="nx-btn-primary w-full py-3 inline-flex justify-center items-center gap-2">Cotizar ahora <ArrowRight size={16}/></Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs text-center">PREGUNTAS FRECUENTES</div>
        <h2 className="font-display text-4xl font-black uppercase mt-3 mb-10 text-center">Dudas comunes</h2>
        <Faq/>
      </section>

      {/* CTA */}
      <section className="relative max-w-[90rem] mx-auto px-6 py-24">
        <div className="relative nx-card p-14 overflow-hidden text-center">
          <div className="absolute inset-0 nx-grid-bg opacity-40"/>
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-[#00AEEF]/25 blur-[120px]"/>
          <div className="relative">
            <div className="font-display tracking-[0.5em] text-[#00F0FF] text-xs">LISTO PARA IMPRIMIR</div>
            <h2 className="font-display text-5xl md:text-7xl font-black mt-4 uppercase">Crea tu cuenta.<br/><span className="nx-stroke-text">Crea tu marca.</span></h2>
            <p className="mt-6 max-w-xl mx-auto text-white/65">Guarda tus mockups, semitonos y archivos DTF listos para producción en tu propio panel.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link to="/register" className="nx-btn-primary px-8 py-4">Crear cuenta gratis</Link>
              <Link to="/tools/mockup" className="nx-btn-ghost px-8 py-4">Probar editor</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
