import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import PageShell from '@/components/PageShell';
import DtfUploader from '@/components/DtfUploader';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import { getSetting, DEFAULT_UV, DEFAULT_UPLOAD, quoteUv, money } from '@/lib/neonexa';
import { ShoppingCart, Layers, Loader2 } from 'lucide-react';

export default function DtfUv() {
  const nav = useNavigate();
  const { add } = useCart();
  const { isAuthed } = useAuth();
  const [cfg, setCfg] = useState(DEFAULT_UV);
  const [rules, setRules] = useState(DEFAULT_UPLOAD);
  const [ready, setReady] = useState(null);
  const [mode, setMode] = useState('hoja');
  const [qty, setQty] = useState(1);
  const [w, setW] = useState(0.3);
  const [h, setH] = useState(0.3);
  const [meters, setMeters] = useState(1);
  const [blanco, setBlanco] = useState(false);
  const [barniz, setBarniz] = useState(false);
  const [notes, setNotes] = useState('');
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSetting('pricing_uv', DEFAULT_UV).then(r => r && setCfg(r.value));
    getSetting('upload_rules', DEFAULT_UPLOAD).then(r => r && setRules(r.value));
  }, []);

  const cur = cfg.currency || 'MXN';
  const area = +(w * h).toFixed(3);
  const q = quoteUv(cfg, mode, { qty, area, meters, blanco, barniz });
  const modes = cfg.modes || DEFAULT_UV.modes;

  const addToCart = async () => {
    if (!approved) { return; }
    setSaving(true);
    let fileId = null;
    try {
      if (isAuthed && ready?.file) {
        const fd = new FormData();
        fd.append('name', ready.file.name);
        fd.append('kind', 'original');
        fd.append('asset', ready.file);
        fd.append('preview', ready.thumb || '');
        fd.append('meta', JSON.stringify(ready.analysis));
        fd.append('owner', pb.authStore.record.id);
        const rec = await pb.collection('files').create(fd);
        fileId = rec.id;
      }
    } catch { /* optional */ }
    add({
      service: 'dtf_uv',
      title: `DTF UV · ${modes[mode]?.label || mode}`,
      thumb: ready?.thumb || '',
      fileId,
      config: { mode, qty, w, h, area, meters, blanco, barniz, notes, fileName: ready?.analysis?.name || null },
      unitLabel: `${money(q.unit, cur)}/${q.unitLabel}`,
      subtotal: q.subtotal,
      currency: cur,
    });
    setSaving(false);
    nav('/cart');
  };

  return (
    <PageShell>
      <Helmet>
        <title>DTF UV — Impresión sobre superficies rígidas | Neonexa Print</title>
        <meta name="description" content="Impresión UV sobre superficies rígidas. Elige modalidad, define dimensiones y agrega recargos especiales para tu pedido." />
      </Helmet>
      <div className="max-w-[80rem] mx-auto px-6 pt-14 pb-24">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">FLUJO DE PEDIDO</div>
        <h1 className="font-display text-5xl md:text-6xl font-black mt-3 uppercase">DTF <span className="text-[#FF2D95]">UV</span></h1>
        <p className="text-white/60 mt-3 max-w-2xl">Impresión UV sobre superficies rígidas. Elige modalidad, define dimensiones y agrega recargos especiales.</p>

        <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
          <div className="space-y-6">
            <div>
              <div className="font-display uppercase tracking-widest text-sm mb-3 text-white/80">1 · Carga y análisis</div>
              <DtfUploader rules={rules} onReady={(r) => { setReady(r); setApproved(false); }}/>
            </div>

            <div>
              <div className="font-display uppercase tracking-widest text-sm mb-3 text-white/80 flex items-center gap-2"><Layers size={15}/>2 · Modalidad</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(modes).map(([k, m]) => (
                  <button key={k} onClick={()=>setMode(k)}
                    className={`nx-card p-4 text-left transition ${mode===k ? 'border-[#FF2D95] bg-[#FF2D95]/5' : 'hover:border-[#00F0FF]'}`}>
                    <div className="text-xs font-display uppercase tracking-widest">{m.label}</div>
                    <div className="text-white/50 text-xs mt-1">{money(m.price, cur)}/{m.unit}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="nx-card p-6 grid sm:grid-cols-3 gap-5">
              {(mode === 'medida') && (<>
                <Field label="Ancho (m)"><input type="number" min={0.05} step="0.05" value={w} onChange={e=>setW(+e.target.value)} className={inp}/></Field>
                <Field label="Alto (m)"><input type="number" min={0.05} step="0.05" value={h} onChange={e=>setH(+e.target.value)} className={inp}/></Field>
              </>)}
              {(mode === 'metro') && (
                <Field label="Metros lineales"><input type="number" min={0.1} step="0.1" value={meters} onChange={e=>setMeters(+e.target.value)} className={inp}/></Field>
              )}
              <Field label="Cantidad"><input type="number" min={1} step="1" value={qty} onChange={e=>setQty(Math.max(1,Math.round(+e.target.value)))} className={inp}/></Field>
              <div className="sm:col-span-3 flex flex-wrap gap-5">
                <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={blanco} onChange={e=>setBlanco(e.target.checked)} className="accent-[#FF2D95]"/>Tinta blanca (+{((cfg.surcharges?.blanco||0)*100)}%)</label>
                <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={barniz} onChange={e=>setBarniz(e.target.checked)} className="accent-[#FF2D95]"/>Barniz brillante (+{((cfg.surcharges?.barniz||0)*100)}%)</label>
              </div>
              <div className="sm:col-span-3">
                <Field label="Observaciones"><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} className={inp}/></Field>
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 nx-card p-6">
            <div className="font-display uppercase tracking-widest text-sm text-[#FF2D95]">Cotización</div>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Modalidad" value={modes[mode]?.label}/>
              {mode==='medida' && <Row label="Área" value={`${area} m²`}/>}
              {mode==='metro' && <Row label="Metros" value={`${meters} m`}/>}
              <Row label="Base" value={money(q.base, cur)}/>
              <Row label="Recargos" value={money(q.surcharge, cur)}/>
              <div className="border-t border-white/10 my-3"/>
              <Row label="Subtotal" value={money(q.subtotal, cur)} big/>
            </div>
            {!ready?.file && <div className="mt-4 text-xs text-[#FFD400]">Sube un archivo para continuar.</div>}
            {ready?.file && (
              <label className="flex items-start gap-3 text-sm text-white/70 cursor-pointer mt-4">
                <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1 accent-[#FF2D95]"/>
                <span>Apruebo que el archivo cargado es correcto y autorizo su impresión tal como se muestra.</span>
              </label>
            )}
            <button disabled={!ready?.file || !approved || saving} onClick={addToCart}
              className="nx-btn-primary w-full py-3 mt-5 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="animate-spin" size={16}/> : <ShoppingCart size={16}/>} Agregar al carrito
            </button>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

const inp = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]";
function Field({ label, children }) {
  return <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">{label}</span><div className="mt-2">{children}</div></label>;
}
function Row({ label, value, big }) {
  return <div className="flex justify-between items-center"><span className="text-white/60">{label}</span><span className={big ? 'font-display text-2xl font-black text-[#FF2D95]' : 'text-white'}>{value}</span></div>;
}
