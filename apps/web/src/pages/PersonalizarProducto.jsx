import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { money, makeFolio } from '@/lib/neonexa';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { CATEGORIES } from '@/pages/Personalizados';
import { Loader2, Upload, PenTool, Check, ShoppingCart, Send, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const inp = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]";
const lbl = "block text-[11px] uppercase tracking-[0.2em] text-white/60 mb-2";

export default function PersonalizarProducto() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { add } = useCart();
  const { isAuthed, user } = useAuth();
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // form state
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [designMode, setDesignMode] = useState('upload'); // upload | help
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [approved, setApproved] = useState(false);
  // quote-only fields
  const [company, setCompany] = useState('');
  const [budget, setBudget] = useState('');
  const [wanted, setWanted] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await pb.collection('products').getFirstListItem(`slug="${slug}"`);
        setProduct(p);
        const v = await pb.collection('product_variants').getFullList({ filter: `product="${p.id}" && active = true` }).catch(() => []);
        setVariants(v);
        if (v[0]) setVariantId(v[0].id);
      } catch { setNotFound(true); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  const variant = variants.find(v => v.id === variantId);
  const unit = useMemo(() => {
    if (!product || product.quote_only) return 0;
    return (product.base_price || 0) + (variant?.price_delta || 0);
  }, [product, variant]);
  const subtotal = +(unit * Math.max(qty, 1)).toFixed(2);

  const summaryTitle = () => {
    const bits = [product.name];
    if (variant) bits.push([variant.model, variant.color, variant.size].filter(Boolean).join('/'));
    return `${bits.join(' · ')} ×${qty}`;
  };

  const uploadDesignFile = async () => {
    if (designMode !== 'upload' || !file) return null;
    try {
      const fd = new FormData();
      fd.append('name', file.name);
      fd.append('kind', 'original');
      fd.append('asset', file);
      fd.append('owner', pb.authStore.record.id);
      const rec = await pb.collection('files').create(fd);
      return rec.id;
    } catch { return null; }
  };

  const addToCart = async () => {
    if (!approved) { toast.error('Por favor aprueba la propuesta/mockup antes de continuar.'); return; }
    const fileId = await uploadDesignFile();
    add({
      service: 'producto', type: 'personalizado', title: summaryTitle(), subtotal,
      fileId,
      meta: {
        product: product.slug, productId: product.id,
        variant: variant ? { model: variant.model, color: variant.color, size: variant.size } : null,
        variantId: variant?.id || null,
        qty, designMode, fileName, instructions, dueDate,
      },
    });
    nav('/cart');
  };

  const submitQuote = async (e) => {
    e.preventDefault();
    if (!isAuthed) { nav('/login'); return; }
    setBusy(true);
    try {
      const fileId = await uploadDesignFile();
      const folio = makeFolio();
      const rec = await pb.collection('quotes').create({
        folio, status: 'nueva',
        product: product.id, variant: variantId || null, qty,
        company, budget: budget ? +budget : null, wanted, instructions,
        due_date: dueDate || null, design_mode: designMode, file: fileId,
        contact: { name: user.name || '', email: user.email, phone: user.phone || '' },
        notes: `Solicitud de cotización — ${product.name}. ${instructions}`,
        events: [{ status: 'nueva', at: new Date().toISOString(), note: 'Solicitud de cotización recibida' }],
        owner: user.id,
      });
      setDone(rec.folio);
    } catch (err) { toast.error(err?.message || 'No se pudo enviar la solicitud.'); }
    finally { setBusy(false); }
  };

  if (loading) return <PageShell><div className="py-40 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div></PageShell>;
  if (notFound || !product) return <PageShell><div className="max-w-3xl mx-auto px-6 py-40 text-center"><div className="font-display text-3xl uppercase">Producto no encontrado</div><Link to="/personalizados" className="nx-btn-ghost px-5 py-3 mt-6 inline-block">Ver catálogo</Link></div></PageShell>;

  if (done) return (
    <PageShell><div className="max-w-2xl mx-auto px-6 py-32 text-center">
      <div className="w-16 h-16 rounded-full bg-[#3ddc84]/20 flex items-center justify-center mx-auto"><Check size={32} className="text-[#3ddc84]"/></div>
      <h1 className="font-display text-4xl font-black uppercase mt-6">Solicitud enviada</h1>
      <p className="text-white/65 mt-3">Tu folio es <span className="text-[#00F0FF] font-display">{done}</span>. Te contactaremos con una propuesta y cotización. Sigue el avance en tu panel.</p>
      <div className="flex gap-3 justify-center mt-8 flex-wrap"><Link to="/dashboard" className="nx-btn-primary px-6 py-3">Ir a mi panel</Link><Link to="/personalizados" className="nx-btn-ghost px-6 py-3">Seguir explorando</Link></div>
    </div></PageShell>
  );

  const catLabel = CATEGORIES.find(c => c.id === product.category)?.label || product.category;

  return (
    <PageShell>
      <div className="max-w-[90rem] mx-auto px-6 pt-10 pb-24">
        <Link to="/personalizados" className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-6"><ArrowLeft size={14}/>Volver al catálogo</Link>
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10">
          <div>
            <div className="nx-card overflow-hidden">
              <div className="aspect-square bg-black/40">
                {product.image && <img src={product.image} alt={product.name} className="w-full h-full object-cover"/>}
              </div>
            </div>
            <div className="mt-4 text-xs uppercase tracking-widest text-[#FF2D95]">{catLabel}</div>
            <h1 className="font-display text-4xl font-black uppercase mt-1">{product.name}</h1>
            <p className="text-white/65 mt-3">{product.description}</p>
            {!product.quote_only && <div className="font-display text-3xl font-black text-[#00AEEF] mt-4">{money(unit)} <span className="text-sm text-white/50">/ unidad</span></div>}
          </div>

          <div className="nx-card p-6 md:p-8">
            {product.quote_only ? (
              <form onSubmit={submitQuote} className="space-y-5">
                <div className="font-display text-xl uppercase text-[#00F0FF]">Solicitud de cotización</div>
                <p className="text-white/55 text-sm -mt-3">Formulario avanzado para kits y proyectos especiales.</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label><span className={lbl}>Empresa</span><input className={inp} value={company} onChange={e => setCompany(e.target.value)} required/></label>
                  <label><span className={lbl}>Cantidad estimada</span><input type="number" min="1" className={inp} value={qty} onChange={e => setQty(+e.target.value)} required/></label>
                  <label><span className={lbl}>Presupuesto estimado (MXN)</span><input type="number" min="0" className={inp} value={budget} onChange={e => setBudget(e.target.value)}/></label>
                  <label><span className={lbl}>Fecha requerida</span><input type="date" className={inp} value={dueDate} onChange={e => setDueDate(e.target.value)}/></label>
                </div>
                <label className="block"><span className={lbl}>Productos deseados</span><textarea rows={2} className={inp} value={wanted} onChange={e => setWanted(e.target.value)} placeholder="Playeras, termos, cajas..."/></label>
                <DesignBlock designMode={designMode} setDesignMode={setDesignMode} fileName={fileName} setFile={setFile} setFileName={setFileName}/>
                <label className="block"><span className={lbl}>Comentarios / instrucciones</span><textarea rows={3} className={inp} value={instructions} onChange={e => setInstructions(e.target.value)}/></label>
                <button disabled={busy} className="nx-btn-primary w-full px-6 py-3 inline-flex items-center justify-center gap-2"><Send size={16}/>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
                {!isAuthed && <p className="text-xs text-white/40 text-center">Necesitas <Link to="/login" className="text-[#00F0FF]">iniciar sesión</Link> para enviar tu solicitud.</p>}
              </form>
            ) : (
              <div className="space-y-6">
                <div className="font-display text-xl uppercase text-[#00F0FF]">Personaliza tu pedido</div>
                {variants.length > 0 && (
                  <label className="block"><span className={lbl}>Variante</span>
                    <select className={inp} value={variantId} onChange={e => setVariantId(e.target.value)}>
                      {variants.map(v => <option key={v.id} value={v.id}>{[v.model, v.color, v.size].filter(Boolean).join(' · ')}{v.price_delta ? ` (+${money(v.price_delta)})` : ''}</option>)}
                    </select>
                  </label>
                )}
                <label className="block"><span className={lbl}>Cantidad</span><input type="number" min="1" className={inp + ' w-32'} value={qty} onChange={e => setQty(Math.max(1, +e.target.value))}/></label>
                <DesignBlock designMode={designMode} setDesignMode={setDesignMode} fileName={fileName} setFile={setFile} setFileName={setFileName}/>
                <label className="block"><span className={lbl}>Instrucciones</span><textarea rows={2} className={inp} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Colores, ubicación del arte, notas..."/></label>
                <label className="block"><span className={lbl}>Fecha requerida (opcional)</span><input type="date" className={inp + ' w-52'} value={dueDate} onChange={e => setDueDate(e.target.value)}/></label>

                <label className="flex items-start gap-3 text-sm text-white/70 cursor-pointer">
                  <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1 accent-[#00F0FF]"/>
                  <span>Apruebo la propuesta/mockup y confirmo que las variantes y el diseño son correctos.</span>
                </label>

                <div className="border-t border-white/10 pt-4 flex items-center justify-between">
                  <span className="text-white/60">Total estimado</span>
                  <span className="font-display text-3xl font-black text-[#00AEEF]">{money(subtotal)}</span>
                </div>
                <button disabled={busy} onClick={async () => { setBusy(true); try { await addToCart(); } finally { setBusy(false); } }} className="nx-btn-primary w-full px-6 py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy ? <Loader2 size={16} className="animate-spin"/> : <ShoppingCart size={16}/>}{busy ? 'Guardando…' : 'Aprobar y pagar'}
                </button>
                <p className="text-xs text-white/40 text-center">En el checkout podrás elegir pagar anticipo (50%) o el total.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function DesignBlock({ designMode, setDesignMode, fileName, setFile, setFileName }) {
  return (
    <div>
      <span className={lbl}>Diseño</span>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setDesignMode('upload')}
          className={`p-4 rounded border text-left transition ${designMode === 'upload' ? 'border-[#00F0FF] bg-[#00AEEF]/10' : 'border-white/15'}`}>
          <Upload size={18} className="text-[#00F0FF]"/><div className="font-display text-sm mt-2 uppercase">Cargar diseño</div>
        </button>
        <button type="button" onClick={() => setDesignMode('help')}
          className={`p-4 rounded border text-left transition ${designMode === 'help' ? 'border-[#FF2D95] bg-[#FF2D95]/10' : 'border-white/15'}`}>
          <PenTool size={18} className="text-[#FF2D95]"/><div className="font-display text-sm mt-2 uppercase">Pedir apoyo de diseño</div>
        </button>
      </div>
      {designMode === 'upload' && (
        <label className="mt-3 flex items-center gap-3 text-sm text-white/60 cursor-pointer border border-dashed border-[#00AEEF]/30 rounded px-4 py-3 hover:border-[#00F0FF]">
          <Upload size={16}/>{fileName || 'Selecciona tu archivo (PNG, PDF, SVG...)'}
          <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); setFileName(f?.name || ''); }}/>
        </label>
      )}
      {designMode === 'help' && <p className="mt-3 text-xs text-white/50">Nuestro equipo creará una propuesta con base en tus instrucciones antes de producir.</p>}
    </div>
  );
}
