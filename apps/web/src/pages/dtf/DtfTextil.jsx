import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import PageShell from '@/components/PageShell';
import DtfUploader from '@/components/DtfUploader';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import { getSetting, DEFAULT_TEXTIL, DEFAULT_UPLOAD, quoteTextil, money } from '@/lib/neonexa';
import { ShoppingCart, Ruler, CheckCircle2, Loader2 } from 'lucide-react';

export default function DtfTextil() {
  const nav = useNavigate();
  const { add } = useCart();
  const { isAuthed } = useAuth();
  const [cfg, setCfg] = useState(DEFAULT_TEXTIL);
  const [rules, setRules] = useState(DEFAULT_UPLOAD);
  const [ready, setReady] = useState(null);
  const [meters, setMeters] = useState(1);
  const [qty, setQty] = useState(1);
  const [width, setWidth] = useState(0.58);
  const [notes, setNotes] = useState('');
  const [approved, setApproved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSetting('pricing_textil', DEFAULT_TEXTIL).then(r => r && setCfg(r.value));
    getSetting('upload_rules', DEFAULT_UPLOAD).then(r => r && setRules(r.value));
  }, []);

  const q = quoteTextil(cfg, meters, qty);
  const cur = cfg.currency || 'MXN';

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
    } catch { /* keep going, file optional */ }
    add({
      service: 'dtf_textil',
      title: `DTF Textil · ${ready?.analysis?.name || 'archivo'}`,
      thumb: ready?.thumb || '',
      fileId,
      config: { width, meters, qty, notes, fileName: ready?.analysis?.name || null },
      unitLabel: `${q.unit} ${cur}/m`,
      subtotal: q.subtotal,
      currency: cur,
    });
    setSaving(false);
    nav('/cart');
  };

  return (
    <PageShell>
      <Helmet>
        <title>DTF Textil — Cotiza tu impresión al instante | Neonexa Print</title>
        <meta name="description" content="Sube tu diseño, lo analizamos automáticamente, defines medidas y metros y obtienes tu cotización de impresión DTF textil al instante." />
      </Helmet>
      <div className="max-w-[80rem] mx-auto px-6 pt-14 pb-24">
        <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">FLUJO DE PEDIDO</div>
        <h1 className="font-display text-5xl md:text-6xl font-black mt-3 uppercase">DTF <span className="text-[#00AEEF]">Textil</span></h1>
        <p className="text-white/60 mt-3 max-w-2xl">Sube tu diseño, lo analizamos automáticamente, defines medidas y metros y obtienes tu cotización al instante.</p>

        <div className="mt-10 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
          <div className="space-y-6">
            <div>
              <div className="font-display uppercase tracking-widest text-sm mb-3 text-white/80">1 · Carga y análisis</div>
              <DtfUploader rules={rules} onReady={(r) => { setReady(r); setApproved(false); }}/>
            </div>

            <div>
              <div className="font-display uppercase tracking-widest text-sm mb-3 text-white/80 flex items-center gap-2"><Ruler size={15}/>2 · Medidas y cantidad</div>
              <div className="nx-card p-6 grid sm:grid-cols-3 gap-5">
                <Field label="Ancho de rollo (m)">
                  <select value={width} onChange={e=>setWidth(+e.target.value)} className={inp}>
                    <option value={0.58}>0.58 m</option>
                    <option value={1.0}>1.00 m</option>
                    <option value={1.6}>1.60 m</option>
                  </select>
                </Field>
                <Field label="Metros lineales">
                  <input type="number" min={cfg.minMeters || 0.5} step="0.5" value={meters} onChange={e=>setMeters(+e.target.value)} className={inp}/>
                </Field>
                <Field label="Cantidad (repeticiones)">
                  <input type="number" min={1} step="1" value={qty} onChange={e=>setQty(Math.max(1, Math.round(+e.target.value)))} className={inp}/>
                </Field>
                <div className="sm:col-span-3">
                  <Field label="Observaciones">
                    <textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notas de color, acabado, urgencia…" className={inp}/>
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 nx-card p-6">
            <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF]">Cotización</div>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Precio unitario" value={`${money(q.unit, cur)} / m`}/>
              <Row label="Metros totales" value={`${q.totalMeters.toFixed(2)} m`}/>
              <div className="border-t border-white/10 my-3"/>
              <Row label="Subtotal" value={money(q.subtotal, cur)} big/>
            </div>
            <div className="mt-3 text-xs text-white/40 space-y-1">
              {(cfg.tiers || []).map((t,i)=>(
                <div key={i}>{t.min}–{t.max >= 9999 ? '+' : t.max} m: {money(t.price, cur)}/m</div>
              ))}
            </div>
            {!ready?.file && <div className="mt-4 text-xs text-[#FFD400]">Sube un archivo para continuar.</div>}
            {ready?.file && (
              <label className="flex items-start gap-3 text-sm text-white/70 cursor-pointer mt-4">
                <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1 accent-[#00F0FF]"/>
                <span>Apruebo que el archivo cargado es correcto y autorizo su impresión tal como se muestra.</span>
              </label>
            )}
            <button disabled={!ready?.file || !approved || saving} onClick={addToCart}
              className="nx-btn-primary w-full py-3 mt-5 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="animate-spin" size={16}/> : <ShoppingCart size={16}/>} Agregar al carrito
            </button>
            {!isAuthed && <div className="mt-3 text-xs text-white/40 flex items-center gap-1"><CheckCircle2 size={12}/>Inicia sesión al pagar para guardar tus archivos.</div>}
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
  return <div className="flex justify-between items-center"><span className="text-white/60">{label}</span><span className={big ? 'font-display text-2xl font-black text-[#00AEEF]' : 'text-white'}>{value}</span></div>;
}
