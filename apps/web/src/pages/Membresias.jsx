import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { money } from '@/lib/neonexa';
import { useAuth } from '@/lib/auth';
import { useMembership, isMembershipActive } from '@/lib/membership';
import { Check, Loader2, Crown, Sparkles, AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const PAY_COLOR = { pendiente: '#FFD400', pagado: '#3ddc84', fallido: '#FF2D95', reembolsado: '#00F0FF' };

const STATUS_LABEL = {
  pendiente: { t: 'Pago pendiente', c: '#FFD400' }, prueba: { t: 'Prueba', c: '#FFD400' }, activa: { t: 'Activa', c: '#3ddc84' },
  vencida: { t: 'Vencida', c: '#FF2D95' }, cancelada: { t: 'Cancelada', c: '#888' },
  pago_fallido: { t: 'Pago fallido', c: '#FF2D95' },
};

export default function Membresias() {
  const { isAuthed, user } = useAuth();
  const { membership, refresh, allowed } = useMembership();
  const nav = useNavigate();
  const [plans, setPlans] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [coupon, setCoupon] = useState('');
  const [couponInfo, setCouponInfo] = useState(null); // { valid, discount_type, discount_value } | { valid:false, reason }
  const [couponChecking, setCouponChecking] = useState(false);

  const loadAll = () => {
    Promise.all([
      pb.collection('membership_plans').getFullList({ filter: 'active = true', sort: 'sort' }).catch(() => []),
      isAuthed ? pb.collection('membership_history').getFullList({ sort: '-created' }).catch(() => []) : Promise.resolve([]),
    ]).then(([p, h]) => { setPlans(p); setHistory(h); }).finally(() => setLoading(false));
  };
  useEffect(loadAll, [isAuthed]);

  const checkCoupon = async () => {
    const code = coupon.trim();
    if (!code) { setCouponInfo(null); return; }
    if (!isAuthed) { nav('/login'); return; }
    setCouponChecking(true); setCouponInfo(null);
    try {
      const res = await pb.send('/api/coupons/validate', {
        method: 'POST', body: { code, context: 'membership', amount: plans[0]?.price || 0 },
      });
      setCouponInfo({ valid: true, discount_type: res.discount_type, discount_value: res.discount_value });
    } catch (ex) {
      setCouponInfo({ valid: false, reason: ex?.response?.message || ex?.message || 'Cupón no válido.' });
    } finally { setCouponChecking(false); }
  };

  const previewPrice = (price) => {
    if (!couponInfo?.valid) return price;
    const discount = couponInfo.discount_type === 'percent' ? price * (couponInfo.discount_value / 100) : couponInfo.discount_value;
    return Math.max(0, +(price - discount).toFixed(2));
  };

  const subscribe = async (plan) => {
    if (!isAuthed) { nav('/login'); return; }
    setBusy(plan.id);
    try {
      const { init_point } = await pb.send('/api/mp/membership-preference', {
        method: 'POST', body: { planId: plan.id, couponCode: couponInfo?.valid ? coupon.trim() : '' },
      });
      window.location.href = init_point;
    } catch (e) { toast.error(e?.response?.message || e?.message || 'No se pudo iniciar el pago.'); setBusy(null); }
  };

  const cancel = async () => {
    if (!membership) return;
    setBusy('cancel');
    try {
      await pb.collection('memberships').update(membership.id, { cancel_at_period_end: true, auto_renew: false });
      await pb.collection('membership_history').create({
        membership: membership.id, action: 'cancelacion', currency: 'MXN',
        note: 'Cancelación al final del periodo pagado', owner: user.id,
      });
      await refresh(); loadAll();
    } catch (e) { toast.error(e?.message || 'Error'); } finally { setBusy(null); }
  };

  const reactivate = async () => {
    if (!membership) return;
    setBusy('react');
    try {
      await pb.collection('memberships').update(membership.id, { cancel_at_period_end: false, auto_renew: true });
      await refresh(); loadAll();
    } catch (e) { toast.error(e?.message || 'Error'); } finally { setBusy(null); }
  };

  const cur = membership;
  const st = cur ? STATUS_LABEL[cur.status] : null;

  return (
    <PageShell>
      <Helmet>
        <title>Membresías Neonexa Tools — Planes y precios</title>
        <meta name="description" content="Suscríbete para desbloquear el estudio de mockups, preparación de impresión y convertidor de semitonos con exportación en alta calidad." />
      </Helmet>
      <section className="max-w-[90rem] mx-auto px-6 pt-16 pb-8">
        <div className="font-display tracking-[0.5em] text-[#00F0FF] text-xs flex items-center gap-2"><Crown size={14}/>MEMBRESÍAS</div>
        <h1 className="font-display text-5xl md:text-7xl font-black mt-3 uppercase">Acceso a<br/><span className="nx-stroke-text">Neonexa Tools</span></h1>
        <p className="mt-6 max-w-xl text-white/65">Suscríbete para desbloquear el estudio de mockups, preparación de impresión y convertidor de semitonos con exportación en alta calidad.</p>
      </section>

      {isAuthed && cur && (
        <section className="max-w-[90rem] mx-auto px-6 pb-4">
          <div className="nx-card p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-white/50">Tu membresía</div>
              <div className="font-display text-2xl font-black mt-1">{cur.expand?.plan?.name || 'Plan Neonexa'}</div>
              <div className="text-sm text-white/60 mt-1">
                {cur.period_end && <>Vigente hasta {new Date(cur.period_end).toLocaleDateString('es-MX')}</>}
                {cur.cancel_at_period_end && <span className="text-[#FF2D95]"> · se cancelará al final del periodo</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {st && <span className="text-sm px-4 py-1.5 rounded-full font-display uppercase tracking-widest" style={{ color: st.c, background: st.c + '20' }}>{st.t}</span>}
              {allowed && <Link to="/tools" className="nx-btn-primary px-5 py-2.5">Abrir Tools</Link>}
              {cur.cancel_at_period_end
                ? <button onClick={reactivate} disabled={busy} className="nx-btn-ghost px-4 py-2.5 inline-flex items-center gap-2"><RefreshCw size={14}/>Reactivar</button>
                : isMembershipActive(cur) && <button onClick={cancel} disabled={busy} className="nx-btn-ghost px-4 py-2.5 inline-flex items-center gap-2"><XCircle size={14}/>Cancelar</button>}
            </div>
          </div>
        </section>
      )}

      <section className="max-w-[90rem] mx-auto px-6 pb-6">
        <div className="nx-card p-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-white/60 uppercase tracking-widest">Cupón</span>
          <input value={coupon} onChange={e => { setCoupon(e.target.value); setCouponInfo(null); }} placeholder="Código de cupón"
            className="bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]"/>
          <button onClick={checkCoupon} disabled={couponChecking || !coupon.trim()} className="nx-btn-ghost px-4 py-2 text-xs">
            {couponChecking ? 'Verificando…' : 'Aplicar cupón'}
          </button>
          {couponInfo?.valid && (
            <span className="text-xs text-[#3ddc84]">
              Válido — {couponInfo.discount_type === 'percent' ? `${couponInfo.discount_value}% de descuento` : `${money(couponInfo.discount_value)} de descuento`}
            </span>
          )}
          {couponInfo && !couponInfo.valid && <span className="text-xs text-[#FF2D95]">{couponInfo.reason}</span>}
        </div>
      </section>

      {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div> : (
        <section className="max-w-[90rem] mx-auto px-6 pb-16 grid md:grid-cols-2 gap-6">
          {plans.length === 0 && <div className="nx-card p-12 text-center text-white/50 md:col-span-2">No hay planes disponibles por ahora.</div>}
          {plans.map(p => {
            const discounted = previewPrice(p.price);
            const isCurrent = cur?.plan === p.id && isMembershipActive(cur);
            return (
              <div key={p.id} className={`nx-card p-8 relative ${p.highlight ? 'ring-1 ring-[#00F0FF]/50' : ''}`}>
                {p.highlight && <span className="absolute -top-3 left-8 px-3 py-1 text-[10px] font-display tracking-widest bg-[#FFD400] text-black flex items-center gap-1"><Sparkles size={11}/>MEJOR VALOR</span>}
                <div className="font-display text-2xl font-black uppercase">{p.name}</div>
                <div className="mt-3 flex items-end gap-2">
                  {discounted !== p.price && <span className="text-white/40 line-through text-lg">{money(p.price, p.currency)}</span>}
                  <span className="font-display text-4xl font-black text-[#00AEEF]">{money(discounted, p.currency)}</span>
                  <span className="text-white/50 text-sm mb-1">/{p.interval === 'anual' ? 'año' : 'mes'}</span>
                </div>
                <ul className="mt-6 space-y-2">
                  {(p.benefits || []).map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white/75"><Check size={16} className="text-[#00F0FF] mt-0.5 shrink-0"/>{b}</li>
                  ))}
                </ul>
                {p.limits && (
                  <div className="mt-4 text-xs text-white/45 space-y-1">
                    {Object.entries(p.limits).map(([k, v]) => (
                      <div key={k} className="uppercase tracking-wider">{k}: {v === -1 ? 'ilimitado' : v}</div>
                    ))}
                  </div>
                )}
                <button onClick={() => subscribe(p)} disabled={busy === p.id || isCurrent}
                  className={`mt-6 w-full px-6 py-3 font-display uppercase tracking-widest ${isCurrent ? 'nx-btn-ghost opacity-60' : 'nx-btn-primary'}`}>
                  {busy === p.id ? 'Procesando…' : isCurrent ? 'Plan actual' : cur ? 'Cambiar a este plan' : 'Suscribirme'}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {isAuthed && history.length > 0 && (
        <section className="max-w-[90rem] mx-auto px-6 pb-24">
          <div className="font-display text-xl uppercase mb-4">Historial de facturación</div>
          <div className="nx-card overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-white/50 border-b border-white/10">
                <th className="p-4">Fecha</th><th className="p-4">Acción</th><th className="p-4">Detalle</th><th className="p-4">Pago</th><th className="p-4">Monto</th>
              </tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-white/5">
                    <td className="p-4 text-white/60">{new Date(h.created).toLocaleDateString('es-MX')}</td>
                    <td className="p-4 uppercase text-xs tracking-widest text-[#00F0FF]">{h.action.replace(/_/g, ' ')}</td>
                    <td className="p-4 text-white/70">{h.note}{h.coupon && <span className="text-[#FFD400]"> · {h.coupon}</span>}</td>
                    <td className="p-4">
                      {h.payment_status && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-display uppercase tracking-widest" style={{ color: PAY_COLOR[h.payment_status] || '#888', background: (PAY_COLOR[h.payment_status] || '#888') + '18' }}>{h.payment_status}</span>
                      )}
                    </td>
                    <td className="p-4 font-display">{h.amount ? money(h.amount, h.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="max-w-[90rem] mx-auto px-6 pb-24">
        <div className="nx-card p-5 flex items-start gap-3 text-sm text-white/55">
          <AlertTriangle size={18} className="text-[#FFD400] shrink-0 mt-0.5"/>
          <p>La renovación automática se activa cuando el proveedor de pago lo permite. Puedes cambiar de plan en cualquier momento y cancelar al final del periodo pagado; conservarás el acceso hasta la fecha de vencimiento.</p>
        </div>
      </section>
    </PageShell>
  );
}
