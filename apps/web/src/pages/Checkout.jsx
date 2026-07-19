import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import { money, makeFolio } from '@/lib/neonexa';
import { Loader2, CreditCard } from 'lucide-react';

const inp = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]";

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { user, isAuthed } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({
    name: user?.name || '', email: user?.email || '', phone: user?.phone || '',
    street: '', city: '', state: '', zip: '',
    invoice: false, company: user?.company || '', rfc: user?.rfc || '', cfdiUse: 'G03',
    terms: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payMode, setPayMode] = useState('total');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  if (!isAuthed) return <Navigate to="/login" replace state={{ from: '/checkout' }}/>;
  if (items.length === 0) return <Navigate to="/cart" replace/>;

  const cur = items[0]?.currency || 'MXN';
  const total = subtotal * 1.16;
  const amountDue = payMode === 'anticipo' ? +(total * 0.5).toFixed(2) : +total.toFixed(2);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.terms) { setErr('Debes aceptar los términos y condiciones.'); return; }
    setBusy(true);
    try {
      const folio = makeFolio();
      const order = await pb.collection('orders').create({
        folio,
        status: 'recibido',
        payment_status: 'pendiente',
        items: items.map(({ id, ...rest }) => rest),
        totals: { subtotal, iva: +(subtotal * 0.16).toFixed(2), total: +total.toFixed(2), currency: cur },
        contact: { name: f.name, email: f.email, phone: f.phone },
        shipping: { street: f.street, city: f.city, state: f.state, zip: f.zip },
        billing: f.invoice ? { company: f.company, rfc: f.rfc, cfdiUse: f.cfdiUse } : null,
        events: [{ status: 'recibido', at: new Date().toISOString(), note: 'Pedido creado por el cliente' }],
        owner: pb.authStore.record.id,
      });
      await pb.collection('payments').create({
        order: order.id,
        amount: amountDue,
        currency: cur,
        method: 'online',
        status: 'pendiente',
        reference: folio,
        meta: { note: 'Intención de pago creada. Pendiente de confirmación por webhook del proveedor.', payMode, total: +total.toFixed(2) },
        owner: pb.authStore.record.id,
      });
      clear();
      const { init_point } = await pb.send('/api/mp/preference', { method: 'POST', body: { orderId: order.id } });
      window.location.href = init_point;
    } catch (ex) {
      setErr(ex?.message || 'No se pudo iniciar el pago. Tu pedido quedó guardado, puedes reintentar desde "Mis pedidos".');
    } finally { setBusy(false); }
  };

  return (
    <PageShell>
      <div className="max-w-[72rem] mx-auto px-6 pt-14 pb-24">
        <h1 className="font-display text-5xl font-black uppercase">Checkout</h1>
        <form onSubmit={submit} className="mt-10 grid lg:grid-cols-[1fr_340px] gap-8 items-start">
          <div className="space-y-6">
            <Section title="Contacto">
              <div className="grid sm:grid-cols-2 gap-4">
                <Fld label="Nombre"><input className={inp} required value={f.name} onChange={set('name')}/></Fld>
                <Fld label="Email"><input className={inp} type="email" required value={f.email} onChange={set('email')}/></Fld>
                <Fld label="Teléfono / WhatsApp"><input className={inp} required value={f.phone} onChange={set('phone')}/></Fld>
              </div>
            </Section>
            <Section title="Entrega">
              <div className="grid sm:grid-cols-2 gap-4">
                <Fld label="Calle y número" full><input className={inp} required value={f.street} onChange={set('street')}/></Fld>
                <Fld label="Ciudad"><input className={inp} required value={f.city} onChange={set('city')}/></Fld>
                <Fld label="Estado"><input className={inp} required value={f.state} onChange={set('state')}/></Fld>
                <Fld label="C.P."><input className={inp} required value={f.zip} onChange={set('zip')}/></Fld>
              </div>
            </Section>
            <Section title="Facturación (CFDI)">
              <label className="flex items-center gap-2 text-sm text-white/70 mb-4"><input type="checkbox" checked={f.invoice} onChange={set('invoice')} className="accent-[#00AEEF]"/>Requiero factura fiscal</label>
              {f.invoice && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Fld label="Razón social"><input className={inp} value={f.company} onChange={set('company')}/></Fld>
                  <Fld label="RFC"><input className={inp} value={f.rfc} onChange={set('rfc')}/></Fld>
                  <Fld label="Uso CFDI"><input className={inp} value={f.cfdiUse} onChange={set('cfdiUse')}/></Fld>
                </div>
              )}
            </Section>
          </div>
          <aside className="lg:sticky lg:top-24 nx-card p-6">
            <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF]">Tu pedido</div>
            <div className="mt-4 space-y-2 text-sm max-h-52 overflow-auto">
              {items.map(it => (
                <div key={it.id} className="flex justify-between gap-3"><span className="text-white/60 truncate">{it.title}</span><span className="shrink-0">{money(it.subtotal, it.currency)}</span></div>
              ))}
            </div>
            <div className="border-t border-white/10 my-4"/>
            <div className="flex justify-between text-sm"><span className="text-white/60">Subtotal</span><span>{money(subtotal, cur)}</span></div>
            <div className="flex justify-between text-sm mt-1"><span className="text-white/60">IVA</span><span>{money(subtotal*0.16, cur)}</span></div>
            <div className="flex justify-between items-center mt-3"><span className="text-white/60">Total</span><span className="font-display text-2xl font-black text-[#00AEEF]">{money(total, cur)}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[{ id: 'total', l: 'Pago total' }, { id: 'anticipo', l: 'Anticipo 50%' }].map(m => (
                <button type="button" key={m.id} onClick={() => setPayMode(m.id)}
                  className={`px-3 py-2 rounded border text-xs font-display uppercase tracking-widest transition ${payMode === m.id ? 'border-[#00F0FF] text-[#00F0FF] bg-[#00AEEF]/10' : 'border-white/15 text-white/60'}`}>{m.l}</button>
              ))}
            </div>
            <div className="flex justify-between items-center mt-3"><span className="text-white/60 text-sm">A pagar ahora</span><span className="font-display text-xl font-black text-[#00F0FF]">{money(amountDue, cur)}</span></div>
            <label className="flex items-start gap-2 text-sm text-white/70 mt-5 cursor-pointer">
              <input type="checkbox" checked={f.terms} onChange={set('terms')} className="mt-1 accent-[#00AEEF]"/>
              <span>Acepto términos, condiciones y política de producción.</span>
            </label>
            {err && <div className="text-[#FF2D95] text-sm mt-3">{err}</div>}
            <button disabled={busy} className="nx-btn-primary w-full py-3 mt-5 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={16}/> : <CreditCard size={16}/>} Confirmar y pagar
            </button>
            <p className="text-[10px] text-white/35 mt-3 leading-relaxed">El cobro se confirma vía webhook del proveedor de pagos. Se registra la transacción y estados de pago (pendiente / pagado / fallido / reembolsado).</p>
          </aside>
        </form>
      </div>
    </PageShell>
  );
}

function Section({ title, children }) {
  return <div className="nx-card p-6"><div className="font-display uppercase tracking-widest text-sm text-white/80 mb-4">{title}</div>{children}</div>;
}
function Fld({ label, children, full }) {
  return <label className={`block ${full ? 'sm:col-span-2' : ''}`}><span className="text-xs uppercase tracking-widest text-white/60">{label}</span><div className="mt-2">{children}</div></label>;
}
