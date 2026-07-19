import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import { money, invalidateSetting } from '@/lib/neonexa';
import { STATUS_META, PAY_META, QUOTE_STATUS_META } from '@/pages/Dashboard';
import { CATEGORIES } from '@/pages/Personalizados';
import { LayoutDashboard, Package, DollarSign, Users, Loader2, Save, ShoppingBag, Crown, Bell, Plus, Trash2, Wrench, Images, ScrollText, FileText, Tag } from 'lucide-react';
import { TOOLS } from '@/lib/tools';
import { PACK_CATEGORIES } from '@/pages/Packs';

const STATUSES = Object.keys(STATUS_META);
const PAYS = ['pendiente', 'pagado', 'fallido', 'reembolsado'];

const TABS_BY_ROLE = {
  admin: ['resumen', 'pedidos', 'cotizaciones', 'productos', 'membresias', 'cupones', 'notificaciones', 'precios', 'tools', 'packs', 'clientes', 'bitacora'],
  ventas: ['resumen', 'pedidos', 'cotizaciones', 'clientes'],
  operador: ['pedidos'],
};

export default function Admin() {
  const { isAuthed, isStaff, user } = useAuth();
  const role = user?.role;
  const allowedTabs = TABS_BY_ROLE[role] || [];
  const [tab, setTab] = useState(null);
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      pb.collection('orders').getFullList({ sort: '-created', expand: 'order_items_via_order' }).catch(() => []),
      pb.collection('quotes').getFullList({ sort: '-created', expand: 'product,file' }).catch(() => []),
      pb.collection('users').getFullList({ sort: '-created' }).catch(() => []),
    ]).then(([o, q, u]) => { setOrders(o); setQuotes(q); setUsers(u); }).finally(() => setLoading(false));
  };
  useEffect(() => { if (isAuthed && isStaff) load(); }, [isAuthed, isStaff]);
  useEffect(() => { if (!tab && allowedTabs.length) setTab(allowedTabs[0]); }, [allowedTabs, tab]);

  if (!isAuthed) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;

  const allTabs = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'pedidos', label: 'Pedidos', icon: Package },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: FileText },
    { id: 'productos', label: 'Productos', icon: ShoppingBag },
    { id: 'membresias', label: 'Membresías', icon: Crown },
    { id: 'cupones', label: 'Cupones', icon: Tag },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
    { id: 'precios', label: 'Precios', icon: DollarSign },
    { id: 'tools', label: 'Tools / Límites', icon: Wrench },
    { id: 'packs', label: 'Packs', icon: Images },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'bitacora', label: 'Bitácora', icon: ScrollText },
  ];
  const tabs = allTabs.filter(t => allowedTabs.includes(t.id));

  return (
    <PageShell>
      <div className="max-w-[90rem] mx-auto px-6 pt-14 pb-24">
        <div className="font-display tracking-[0.4em] text-[#FF2D95] text-xs">ADMINISTRACIÓN</div>
        <h1 className="font-display text-5xl font-black uppercase mt-3">Panel <span className="text-[#00AEEF]">Neonexa</span></h1>

        <div className="mt-8 flex gap-2 border-b border-white/10 flex-wrap">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-5 py-3 font-display text-xs uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px transition ${tab === t.id ? 'border-[#FF2D95] text-[#FF2D95]' : 'border-transparent text-white/50 hover:text-white'}`}>
                <Icon size={14}/>{t.label}
              </button>
            );
          })}
        </div>

        {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div> : (
          <div className="mt-8">
            {tab === 'resumen' && <Resumen orders={orders} users={users}/>}
            {tab === 'pedidos' && <Pedidos orders={orders} reload={load}/>}
            {tab === 'cotizaciones' && <Cotizaciones quotes={quotes} reload={load}/>}
            {tab === 'productos' && <ProductosAdmin/>}
            {tab === 'membresias' && <MembresiasAdmin/>}
            {tab === 'cupones' && <CuponesAdmin/>}
            {tab === 'notificaciones' && <NotificacionesAdmin/>}
            {tab === 'precios' && <Precios/>}
            {tab === 'tools' && <ToolLimitsAdmin/>}
            {tab === 'packs' && <PacksAdmin/>}
            {tab === 'clientes' && <Clientes users={users}/>}
            {tab === 'bitacora' && <Bitacora/>}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Resumen({ orders, users }) {
  const now = new Date();
  const paid = orders.filter(o => o.payment_status === 'pagado');
  const sum = (list) => list.reduce((s, o) => s + (o.totals?.total || 0), 0);
  const inRange = (o, days) => (now - new Date(o.created)) / 86400000 <= days;
  const byStatus = STATUSES.map(s => ({ s, n: orders.filter(o => o.status === s).length })).filter(x => x.n);
  const incidencias = orders.filter(o => o.status === 'requiere_correccion').length;
  const nuevos = users.filter(u => u.role !== 'admin' && inRange(u, 7)).length;
  const cards = [
    { label: 'Ventas hoy', v: money(sum(paid.filter(o => inRange(o, 1)))) },
    { label: 'Ventas 7 días', v: money(sum(paid.filter(o => inRange(o, 7)))) },
    { label: 'Ventas 30 días', v: money(sum(paid.filter(o => inRange(o, 30)))) },
    { label: 'Pedidos totales', v: orders.length },
    { label: 'Incidencias', v: incidencias, alert: incidencias > 0 },
    { label: 'Clientes nuevos (7d)', v: nuevos },
  ];
  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="nx-card p-6">
            <div className="text-xs uppercase tracking-widest text-white/50">{c.label}</div>
            <div className={`font-display text-3xl font-black mt-2 ${c.alert ? 'text-[#FF2D95]' : 'text-[#00AEEF]'}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <div className="nx-card p-6 mt-4">
        <div className="text-xs uppercase tracking-widest text-white/50 mb-4">Pedidos por estado</div>
        <div className="flex flex-wrap gap-3">
          {byStatus.length === 0 && <span className="text-white/40 text-sm">Sin pedidos.</span>}
          {byStatus.map(({ s, n }) => (
            <span key={s} className="text-sm px-3 py-1.5 rounded-full font-display uppercase tracking-widest" style={{ color: STATUS_META[s].color, background: STATUS_META[s].color + '18' }}>{STATUS_META[s].label}: {n}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Pedidos({ orders, reload }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(null);
  const [comments, setComments] = useState({});
  const [filesOpen, setFilesOpen] = useState(null);
  const update = async (o, field, value) => {
    setSaving(o.id);
    try {
      const comment = comments[o.id] || '';
      const patch = { [field]: value };
      if (field === 'status') {
        const by = user?.name || user?.email || 'admin';
        patch.events = [...(o.events || []), { status: value, at: new Date().toISOString(), note: comment || 'Actualizado por admin', by }];
        try {
          await pb.collection('production_events').create({
            order: o.id, status: value, comment, by_name: by, notified: true, owner: o.owner,
          });
        } catch { /* ignore */ }
      }
      await pb.collection('orders').update(o.id, patch);
      setComments(c => ({ ...c, [o.id]: '' }));
      reload();
    } catch { /* ignore */ } finally { setSaving(null); }
  };
  if (orders.length === 0) return <div className="nx-card p-16 text-center text-white/60">No hay pedidos.</div>;
  return (
    <div className="space-y-4">
      {orders.map(o => (
        <div key={o.id} className="nx-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display text-lg">{o.folio}</div>
              <div className="text-xs text-white/40">{o.contact?.name} · {o.contact?.email} · {new Date(o.created).toLocaleDateString('es-MX')}</div>
            </div>
            <div className="flex items-center gap-3">
              {saving === o.id && <Loader2 className="animate-spin text-[#00AEEF]" size={16}/>}
              <span className="font-display font-black text-[#00AEEF]">{money(o.totals?.total, o.totals?.currency || 'MXN')}</span>
            </div>
          </div>
          <div className="mt-3 text-sm text-white/50">{(o.expand?.order_items_via_order || []).map(i => i.title).join(' · ')}</div>
          <div className="mt-4 flex flex-wrap gap-4">
            <label className="text-xs">
              <span className="uppercase tracking-widest text-white/50 block mb-1">Estado</span>
              <select value={o.status} onChange={e => update(o, 'status', e.target.value)} className={sel} style={{ color: STATUS_META[o.status]?.color }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="uppercase tracking-widest text-white/50 block mb-1">Pago</span>
              <select value={o.payment_status || 'pendiente'} onChange={e => update(o, 'payment_status', e.target.value)} className={sel} style={{ color: PAY_META[o.payment_status] }}>
                {PAYS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-xs flex-1 min-w-[200px]">
              <span className="uppercase tracking-widest text-white/50 block mb-1">Comentario (se guarda al cambiar estado)</span>
              <input value={comments[o.id] || ''} onChange={e => setComments(c => ({ ...c, [o.id]: e.target.value }))} placeholder="Nota interna / mensaje al cliente" className={sel + ' w-full'}/>
            </label>
          </div>
          <button onClick={() => setFilesOpen(filesOpen === o.id ? null : o.id)} className="nx-btn-ghost px-3 py-1.5 text-xs mt-3">
            {filesOpen === o.id ? 'Ocultar archivos' : 'Ver / subir archivos'}
          </button>
          {filesOpen === o.id && <OrderFiles order={o}/>}
          {(o.events || []).length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3 space-y-1">
              <div className="text-[11px] uppercase tracking-widest text-white/40 mb-1">Historial de cambios</div>
              {o.events.slice().reverse().map((e, i) => (
                <div key={i} className="text-xs text-white/55 flex flex-wrap gap-x-2">
                  <span style={{ color: STATUS_META[e.status]?.color }}>{STATUS_META[e.status]?.label || e.status}</span>
                  <span className="text-white/35">{new Date(e.at).toLocaleString('es-MX')}</span>
                  {e.by && <span className="text-white/40">· {e.by}</span>}
                  {e.note && <span className="text-white/50">— {e.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const QUOTE_STATUSES = Object.keys(QUOTE_STATUS_META);

function Cotizaciones({ quotes, reload }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(null);
  const [drafts, setDrafts] = useState({});

  const draft = (q) => drafts[q.id] || { quoted_amount: q.quoted_amount ?? '', quoted_notes: q.quoted_notes || '' };
  const setDraft = (q, patch) => setDrafts(d => ({ ...d, [q.id]: { ...draft(q), ...patch } }));

  const updateStatus = async (q, status) => {
    setSaving(q.id);
    try {
      const by = user?.name || user?.email || 'staff';
      const events = [...(q.events || []), { status, at: new Date().toISOString(), note: 'Actualizado por staff', by }];
      await pb.collection('quotes').update(q.id, { status, events });
      reload();
    } catch { /* ignore */ } finally { setSaving(null); }
  };

  const saveQuote = async (q) => {
    setSaving(q.id);
    try {
      const d = draft(q);
      await pb.collection('quotes').update(q.id, {
        quoted_amount: d.quoted_amount === '' ? null : +d.quoted_amount,
        quoted_notes: d.quoted_notes,
      });
      reload();
    } catch { /* ignore */ } finally { setSaving(null); }
  };

  const openFile = async (f) => {
    try {
      const token = await pb.files.getToken();
      window.open(pb.files.getUrl(f, f.asset, { token }), '_blank');
    } catch { /* ignore */ }
  };

  if (quotes.length === 0) return <div className="nx-card p-16 text-center text-white/60">No hay solicitudes de cotización.</div>;
  return (
    <div className="space-y-4">
      {quotes.map(q => {
        const d = draft(q);
        return (
          <div key={q.id} className="nx-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg">{q.folio} · {q.expand?.product?.name || 'Producto'}</div>
                <div className="text-xs text-white/40">{q.contact?.name} · {q.contact?.email} · {new Date(q.created).toLocaleDateString('es-MX')}</div>
              </div>
              {saving === q.id && <Loader2 className="animate-spin text-[#00AEEF]" size={16}/>}
            </div>
            <div className="mt-3 text-sm text-white/60 space-y-1">
              <div>Cantidad estimada: {q.qty}{q.company ? ` · Empresa: ${q.company}` : ''}{q.budget ? ` · Presupuesto: ${money(q.budget)}` : ''}</div>
              {q.wanted && <div>Productos deseados: {q.wanted}</div>}
              {q.instructions && <div>Instrucciones: {q.instructions}</div>}
              {q.expand?.file && <button onClick={() => openFile(q.expand.file)} className="text-[#00F0FF] underline">Ver archivo adjunto</button>}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 items-end">
              <label className="text-xs">
                <span className="uppercase tracking-widest text-white/50 block mb-1">Estado</span>
                <select value={q.status} onChange={e => updateStatus(q, e.target.value)} className={sel} style={{ color: QUOTE_STATUS_META[q.status]?.color }}>
                  {QUOTE_STATUSES.map(s => <option key={s} value={s}>{QUOTE_STATUS_META[s].label}</option>)}
                </select>
              </label>
              <label className="text-xs">
                <span className="uppercase tracking-widest text-white/50 block mb-1">Monto cotizado</span>
                <input type="number" min="0" value={d.quoted_amount} onChange={e => setDraft(q, { quoted_amount: e.target.value })} className={sel + ' w-32'}/>
              </label>
              <label className="text-xs flex-1 min-w-[200px]">
                <span className="uppercase tracking-widest text-white/50 block mb-1">Notas de la cotización</span>
                <input value={d.quoted_notes} onChange={e => setDraft(q, { quoted_notes: e.target.value })} className={sel + ' w-full'}/>
              </label>
              <button onClick={() => saveQuote(q)} className="nx-btn-ghost px-4 py-1.5 text-xs">Guardar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FILE_KIND_LABEL = { original: 'Original', processed: 'Procesado', approved: 'Aprobado', production: 'Producción' };

function OrderFiles({ order }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('processed');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => pb.collection('files').getFullList({ filter: `order = "${order.id}"`, sort: 'created' }).then(setFiles).catch(() => setFiles([])).finally(() => setLoading(false));
  useEffect(load, []);

  const upload = async () => {
    if (!file) { setMsg('Selecciona un archivo.'); return; }
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('name', file.name);
      fd.append('kind', kind);
      fd.append('asset', file);
      fd.append('order', order.id);
      fd.append('owner', order.owner);
      await pb.collection('files').create(fd);
      setFile(null);
      load();
    } catch (e) { setMsg(e?.message || 'No se pudo subir el archivo.'); } finally { setBusy(false); }
  };

  const openFile = async (f) => {
    try {
      const token = await pb.files.getToken();
      window.open(pb.files.getUrl(f, f.asset, { token }), '_blank');
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      {loading ? <Loader2 className="animate-spin text-[#00AEEF]" size={16}/> : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 text-sm">
              <span className="text-xs px-2 py-0.5 rounded-full font-display uppercase tracking-widest text-[#00F0FF] bg-[#00AEEF]/10">{FILE_KIND_LABEL[f.kind] || f.kind}</span>
              <button onClick={() => openFile(f)} className="text-white/70 hover:text-[#00F0FF] underline truncate">{f.name}</button>
              <span className="text-white/30 text-xs">{new Date(f.created).toLocaleDateString('es-MX')}</span>
            </div>
          ))}
          {files.length === 0 && <div className="text-white/40 text-sm">Sin archivos para este pedido.</div>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <select value={kind} onChange={e => setKind(e.target.value)} className={sel}>
          <option value="processed">Procesado</option>
          <option value="approved">Aprobado</option>
          <option value="production">Producción</option>
        </select>
        <input type="file" onChange={e => setFile(e.target.files[0])} className="text-xs text-white/60"/>
        <button disabled={busy} onClick={upload} className="nx-btn-ghost px-4 py-1.5 text-xs">{busy ? 'Subiendo…' : 'Subir versión'}</button>
        {msg && <span className="text-[#FF2D95] text-xs">{msg}</span>}
      </div>
    </div>
  );
}

function Precios() {
  const [textil, setTextil] = useState(null);
  const [uv, setUv] = useState(null);
  const [rules, setRules] = useState(null);
  const [recs, setRecs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const map = {};
      for (const key of ['pricing_textil', 'pricing_uv', 'upload_rules']) {
        try { map[key] = await pb.collection('settings').getFirstListItem(`key="${key}"`); } catch { /* ignore */ }
      }
      setRecs(map);
      setTextil(map.pricing_textil?.value);
      setUv(map.pricing_uv?.value);
      setRules(map.upload_rules?.value);
    })();
  }, []);

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const write = async (key, value) => {
        if (recs[key]) await pb.collection('settings').update(recs[key].id, { value });
        else await pb.collection('settings').create({ key, value });
        invalidateSetting(key);
      };
      await write('pricing_textil', textil);
      await write('pricing_uv', uv);
      await write('upload_rules', rules);
      setMsg('Precios y reglas guardados.');
    } catch (e) { setMsg(e?.message || 'Error al guardar.'); } finally { setBusy(false); }
  };

  if (!textil || !uv || !rules) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="nx-card p-6">
        <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF] mb-4">DTF Textil · escalas por metro</div>
        {textil.tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <input type="number" value={t.min} onChange={e => setTextil(c => ({ ...c, tiers: c.tiers.map((x, j) => j === i ? { ...x, min: +e.target.value } : x) }))} className={numi}/>
            <span className="text-white/40">a</span>
            <input type="number" value={t.max} onChange={e => setTextil(c => ({ ...c, tiers: c.tiers.map((x, j) => j === i ? { ...x, max: +e.target.value } : x) }))} className={numi}/>
            <span className="text-white/40">m =</span>
            <input type="number" value={t.price} onChange={e => setTextil(c => ({ ...c, tiers: c.tiers.map((x, j) => j === i ? { ...x, price: +e.target.value } : x) }))} className={numi}/>
            <span className="text-white/40 text-sm">MXN/m</span>
          </div>
        ))}
      </div>

      <div className="nx-card p-6">
        <div className="font-display uppercase tracking-widest text-sm text-[#FF2D95] mb-4">DTF UV · precios por modalidad</div>
        {Object.entries(uv.modes).map(([k, m]) => (
          <div key={k} className="flex items-center gap-3 mb-3">
            <span className="w-40 text-sm text-white/70">{m.label}</span>
            <input type="number" value={m.price} onChange={e => setUv(c => ({ ...c, modes: { ...c.modes, [k]: { ...m, price: +e.target.value } } }))} className={numi}/>
            <span className="text-white/40 text-sm">MXN/{m.unit}</span>
          </div>
        ))}
        <div className="flex flex-wrap gap-4 mt-4">
          <label className="text-sm text-white/70 flex items-center gap-2">Recargo blanco %<input type="number" value={(uv.surcharges.blanco * 100)} onChange={e => setUv(c => ({ ...c, surcharges: { ...c.surcharges, blanco: +e.target.value / 100 } }))} className={numi}/></label>
          <label className="text-sm text-white/70 flex items-center gap-2">Recargo barniz %<input type="number" value={(uv.surcharges.barniz * 100)} onChange={e => setUv(c => ({ ...c, surcharges: { ...c.surcharges, barniz: +e.target.value / 100 } }))} className={numi}/></label>
        </div>
      </div>

      <div className="nx-card p-6">
        <div className="font-display uppercase tracking-widest text-sm text-white/80 mb-4">Reglas de archivos</div>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="text-sm text-white/70 flex items-center gap-2">Formatos<input value={(rules.formats || []).join(',')} onChange={e => setRules(c => ({ ...c, formats: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} className={numi + ' w-64'}/></label>
          <label className="text-sm text-white/70 flex items-center gap-2">Máx MB<input type="number" value={rules.maxSizeMB} onChange={e => setRules(c => ({ ...c, maxSizeMB: +e.target.value }))} className={numi}/></label>
          <label className="text-sm text-white/70 flex items-center gap-2">DPI mín<input type="number" value={rules.minDPI} onChange={e => setRules(c => ({ ...c, minDPI: +e.target.value }))} className={numi}/></label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button disabled={busy} onClick={save} className="nx-btn-primary px-6 py-3 inline-flex items-center gap-2"><Save size={16}/>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        {msg && <span className="text-sm text-[#00F0FF]">{msg}</span>}
      </div>
    </div>
  );
}

function Clientes({ users }) {
  const clients = users.filter(u => u.role !== 'admin');
  if (clients.length === 0) return <div className="nx-card p-16 text-center text-white/60">Sin clientes registrados.</div>;
  return (
    <div className="nx-card overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-white/50 border-b border-white/10">
          <th className="p-4">Nombre</th><th className="p-4">Email</th><th className="p-4">Teléfono</th><th className="p-4">Empresa</th><th className="p-4">Alta</th>
        </tr></thead>
        <tbody>
          {clients.map(c => (
            <tr key={c.id} className="border-b border-white/5">
              <td className="p-4">{c.name || '—'}</td>
              <td className="p-4 text-white/70">{c.email}</td>
              <td className="p-4 text-white/70">{c.phone || '—'}</td>
              <td className="p-4 text-white/70">{c.company || '—'}</td>
              <td className="p-4 text-white/40">{new Date(c.created).toLocaleDateString('es-MX')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductosAdmin() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const blank = { name: '', slug: '', category: 'playeras', description: '', image: '', base_price: '', quote_only: false, active: true };

  const load = () => pb.collection('products').getFullList({ sort: 'category' }).then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  useEffect(load, []);

  const save = async () => {
    const data = { ...editing };
    data.base_price = data.base_price === '' ? null : +data.base_price;
    if (!data.slug) data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
      if (data.id) await pb.collection('products').update(data.id, data);
      else await pb.collection('products').create(data);
      setEditing(null); load();
    } catch (e) { alert(e?.message || 'Error al guardar'); }
  };
  const del = async (id) => { if (!confirm('¿Eliminar producto?')) return; try { await pb.collection('products').delete(id); load(); } catch { /* ignore */ } };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;
  return (
    <div>
      <button onClick={() => setEditing(blank)} className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2 mb-6"><Plus size={16}/>Nuevo producto</button>
      {editing && (
        <div className="nx-card p-6 mb-6 grid sm:grid-cols-2 gap-4">
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Nombre</span><input className={numi + ' w-full'} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Categoría</span>
            <select className={sel + ' w-full'} value={editing.category} onChange={e => setEditing(x => ({ ...x, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Descripción</span><input className={numi + ' w-full'} value={editing.description} onChange={e => setEditing(x => ({ ...x, description: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">URL imagen</span><input className={numi + ' w-full'} value={editing.image} onChange={e => setEditing(x => ({ ...x, image: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Precio base (MXN)</span><input type="number" className={numi + ' w-full'} value={editing.base_price ?? ''} onChange={e => setEditing(x => ({ ...x, base_price: e.target.value }))} disabled={editing.quote_only}/></label>
          <div className="flex items-center gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.quote_only} onChange={e => setEditing(x => ({ ...x, quote_only: e.target.checked }))} className="accent-[#00F0FF]"/>Solo cotización</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={e => setEditing(x => ({ ...x, active: e.target.checked }))} className="accent-[#00F0FF]"/>Activo</label>
          </div>
          <div className="sm:col-span-2 flex gap-3"><button onClick={save} className="nx-btn-primary px-5 py-2.5">Guardar</button><button onClick={() => setEditing(null)} className="nx-btn-ghost px-5 py-2.5">Cancelar</button></div>
        </div>
      )}
      <div className="space-y-3">
        {products.map(p => (
          <div key={p.id} className="nx-card p-4 flex items-center gap-4">
            {p.image && <img src={p.image} alt={p.name} className="w-14 h-14 object-cover rounded"/>}
            <div className="flex-1">
              <div className="font-display">{p.name} {!p.active && <span className="text-[#FF2D95] text-xs">(inactivo)</span>}</div>
              <div className="text-xs text-white/40">{CATEGORIES.find(c => c.id === p.category)?.label} · {p.quote_only ? 'cotización' : money(p.base_price)}</div>
            </div>
            <button onClick={() => setEditing({ ...p, base_price: p.base_price ?? '' })} className="nx-btn-ghost px-3 py-1.5 text-xs">Editar</button>
            <button onClick={() => del(p.id)} className="text-[#FF2D95] p-2"><Trash2 size={16}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembresiasAdmin() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const blank = { name: '', interval: 'mensual', price: 0, currency: 'MXN', benefits: [], limits: {}, highlight: false, active: true, sort: 0 };

  const load = () => pb.collection('membership_plans').getFullList({ sort: 'sort' }).then(setPlans).catch(() => setPlans([])).finally(() => setLoading(false));
  useEffect(load, []);

  const save = async () => {
    const data = { ...editing, price: +editing.price, sort: +editing.sort };
    if (typeof data.benefits === 'string') data.benefits = data.benefits.split('\n').map(s => s.trim()).filter(Boolean);
    if (typeof data.limits === 'string') { try { data.limits = JSON.parse(data.limits); } catch { data.limits = {}; } }
    try {
      if (data.id) await pb.collection('membership_plans').update(data.id, data);
      else await pb.collection('membership_plans').create(data);
      setEditing(null); load();
    } catch (e) { alert(e?.message || 'Error'); }
  };
  const del = async (id) => { if (!confirm('¿Eliminar plan?')) return; try { await pb.collection('membership_plans').delete(id); load(); } catch { /* ignore */ } };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;
  return (
    <div>
      <p className="text-white/55 text-sm mb-4">Nombres, precios, límites y beneficios se administran aquí, sin código.</p>
      <button onClick={() => setEditing(blank)} className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2 mb-6"><Plus size={16}/>Nuevo plan</button>
      {editing && (
        <div className="nx-card p-6 mb-6 grid sm:grid-cols-2 gap-4">
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Nombre</span><input className={numi + ' w-full'} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Periodo</span>
            <select className={sel + ' w-full'} value={editing.interval} onChange={e => setEditing(x => ({ ...x, interval: e.target.value }))}><option value="mensual">Mensual</option><option value="anual">Anual</option></select></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Precio</span><input type="number" className={numi + ' w-full'} value={editing.price} onChange={e => setEditing(x => ({ ...x, price: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Orden</span><input type="number" className={numi + ' w-full'} value={editing.sort} onChange={e => setEditing(x => ({ ...x, sort: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Beneficios (uno por línea)</span><textarea rows={4} className={numi + ' w-full'} value={Array.isArray(editing.benefits) ? editing.benefits.join('\n') : editing.benefits} onChange={e => setEditing(x => ({ ...x, benefits: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Límites (JSON: {'{'}"mockup":100,"storageMB":500{'}'})</span><textarea rows={2} className={numi + ' w-full font-mono'} value={typeof editing.limits === 'string' ? editing.limits : JSON.stringify(editing.limits)} onChange={e => setEditing(x => ({ ...x, limits: e.target.value }))}/></label>
          <div className="flex items-center gap-4 text-sm text-white/70">
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.highlight} onChange={e => setEditing(x => ({ ...x, highlight: e.target.checked }))} className="accent-[#00F0FF]"/>Destacado</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={e => setEditing(x => ({ ...x, active: e.target.checked }))} className="accent-[#00F0FF]"/>Activo</label>
          </div>
          <div className="sm:col-span-2 flex gap-3"><button onClick={save} className="nx-btn-primary px-5 py-2.5">Guardar</button><button onClick={() => setEditing(null)} className="nx-btn-ghost px-5 py-2.5">Cancelar</button></div>
        </div>
      )}
      <div className="space-y-3">
        {plans.map(p => (
          <div key={p.id} className="nx-card p-4 flex items-center gap-4">
            <Crown size={18} className="text-[#FFD400]"/>
            <div className="flex-1">
              <div className="font-display">{p.name} {!p.active && <span className="text-[#FF2D95] text-xs">(inactivo)</span>}</div>
              <div className="text-xs text-white/40">{p.interval} · {money(p.price, p.currency)} · {(p.benefits || []).length} beneficios</div>
            </div>
            <button onClick={() => setEditing(p)} className="nx-btn-ghost px-3 py-1.5 text-xs">Editar</button>
            <button onClick={() => del(p.id)} className="text-[#FF2D95] p-2"><Trash2 size={16}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function CuponesAdmin() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const blank = { code: '', discount_type: 'percent', discount_value: 10, applies_to: 'all', max_uses: 0, min_amount: 0, valid_from: '', valid_until: '', active: true };

  const load = () => pb.collection('coupons').getFullList({ sort: '-created' }).then(setCoupons).catch(() => setCoupons([])).finally(() => setLoading(false));
  useEffect(load, []);

  const save = async () => {
    const data = {
      ...editing, code: editing.code.trim().toUpperCase(),
      discount_value: +editing.discount_value, max_uses: +editing.max_uses || 0, min_amount: +editing.min_amount || 0,
      valid_from: editing.valid_from || null, valid_until: editing.valid_until || null,
    };
    try {
      if (data.id) await pb.collection('coupons').update(data.id, data);
      else await pb.collection('coupons').create(data);
      setEditing(null); load();
    } catch (e) { alert(e?.message || 'No se pudo guardar el cupón.'); }
  };
  const del = async (id) => { if (!confirm('¿Eliminar cupón?')) return; try { await pb.collection('coupons').delete(id); load(); } catch { /* ignore */ } };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;
  return (
    <div>
      <p className="text-white/55 text-sm mb-4">Cupones reales con expiración, límite de uso y validación en servidor — aplican a membresías, pedidos, o ambos.</p>
      <button onClick={() => setEditing(blank)} className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2 mb-6"><Plus size={16}/>Nuevo cupón</button>
      {editing && (
        <div className="nx-card p-6 mb-6 grid sm:grid-cols-3 gap-4">
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Código</span><input className={numi + ' w-full'} value={editing.code} onChange={e => setEditing(x => ({ ...x, code: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Tipo</span>
            <select className={sel + ' w-full'} value={editing.discount_type} onChange={e => setEditing(x => ({ ...x, discount_type: e.target.value }))}><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option></select></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Valor</span><input type="number" className={numi + ' w-full'} value={editing.discount_value} onChange={e => setEditing(x => ({ ...x, discount_value: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Aplica a</span>
            <select className={sel + ' w-full'} value={editing.applies_to} onChange={e => setEditing(x => ({ ...x, applies_to: e.target.value }))}>
              <option value="all">Membresías y pedidos</option><option value="membership">Solo membresías</option><option value="order">Solo pedidos</option>
            </select></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Usos máximos (0 = ilimitado)</span><input type="number" className={numi + ' w-full'} value={editing.max_uses} onChange={e => setEditing(x => ({ ...x, max_uses: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Monto mínimo (0 = sin mínimo)</span><input type="number" className={numi + ' w-full'} value={editing.min_amount} onChange={e => setEditing(x => ({ ...x, min_amount: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Vigente desde</span><input type="date" className={numi + ' w-full'} value={editing.valid_from || ''} onChange={e => setEditing(x => ({ ...x, valid_from: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Vigente hasta</span><input type="date" className={numi + ' w-full'} value={editing.valid_until || ''} onChange={e => setEditing(x => ({ ...x, valid_until: e.target.value }))}/></label>
          <label className="flex items-center gap-2 text-sm text-white/70 self-end"><input type="checkbox" checked={editing.active} onChange={e => setEditing(x => ({ ...x, active: e.target.checked }))} className="accent-[#00F0FF]"/>Activo</label>
          <div className="sm:col-span-3 flex gap-3"><button onClick={save} className="nx-btn-primary px-5 py-2.5">Guardar</button><button onClick={() => setEditing(null)} className="nx-btn-ghost px-5 py-2.5">Cancelar</button></div>
        </div>
      )}
      <div className="space-y-3">
        {coupons.length === 0 && <div className="nx-card p-8 text-center text-white/50 text-sm">Sin cupones todavía.</div>}
        {coupons.map(c => (
          <div key={c.id} className="nx-card p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-display">{c.code} {!c.active && <span className="text-[#FF2D95] text-xs">(inactivo)</span>}</div>
              <div className="text-xs text-white/40">
                {c.discount_type === 'percent' ? `${c.discount_value}%` : money(c.discount_value)} · {{ all: 'membresías y pedidos', membership: 'solo membresías', order: 'solo pedidos' }[c.applies_to]} · usado {c.used_count || 0}{c.max_uses ? `/${c.max_uses}` : ''}
                {(c.valid_from || c.valid_until) && <> · {c.valid_from ? new Date(c.valid_from).toLocaleDateString('es-MX') : '—'} → {c.valid_until ? new Date(c.valid_until).toLocaleDateString('es-MX') : '—'}</>}
              </div>
            </div>
            <button onClick={() => setEditing({ ...c, valid_from: c.valid_from?.slice(0, 10) || '', valid_until: c.valid_until?.slice(0, 10) || '' })} className="nx-btn-ghost px-3 py-1.5 text-xs">Editar</button>
            <button onClick={() => del(c.id)} className="text-[#FF2D95] p-2"><Trash2 size={16}/></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificacionesAdmin() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = () => pb.collection('notification_settings').getFullList({ sort: 'created' }).then(setSettings).catch(() => setSettings([])).finally(() => setLoading(false));
  useEffect(load, []);

  const toggle = async (s, field) => {
    setSaving(s.id);
    try { await pb.collection('notification_settings').update(s.id, { [field]: !s[field] }); setSettings(list => list.map(x => x.id === s.id ? { ...x, [field]: !x[field] } : x)); }
    catch { /* ignore */ } finally { setSaving(null); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;
  return (
    <div>
      <p className="text-white/55 text-sm mb-4">Configura qué eventos notifican al cliente y por qué canal.</p>
      <div className="nx-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-white/50 border-b border-white/10">
            <th className="p-4">Evento</th><th className="p-4 text-center">Notificar</th><th className="p-4 text-center">Email</th><th className="p-4 text-center">WhatsApp</th>
          </tr></thead>
          <tbody>
            {settings.map(s => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="p-4">{s.label}{saving === s.id && <Loader2 size={12} className="inline ml-2 animate-spin text-[#00AEEF]"/>}</td>
                {['notify_client', 'email', 'whatsapp'].map(f => (
                  <td key={f} className="p-4 text-center">
                    <input type="checkbox" checked={!!s[f]} onChange={() => toggle(s, f)} className="accent-[#00F0FF] w-4 h-4"/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const sel = "bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-sm focus:outline-none focus:border-[#00F0FF]";
const numi = "bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm w-24 focus:outline-none focus:border-[#00F0FF]";

function ToolLimitsAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const load = () => pb.collection('tool_limits').getFullList({ sort: 'tool' }).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const patch = (id, k, v) => setRows(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));
  const save = async (r) => {
    setMsg('');
    try { await pb.collection('tool_limits').update(r.id, { monthly_limit: Number(r.monthly_limit), enabled: r.enabled, plan_name: r.plan_name }); setMsg('Guardado ' + r.id); }
    catch (e) { setMsg('Error: ' + String(e)); }
  };
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#FF2D95]" size={36}/></div>;
  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm">Configura el límite mensual de trabajos por herramienta y plan (sin código). Usa <span className="text-[#00F0FF]">-1</span> para ilimitado; desactiva para bloquear la herramienta en ese plan.</p>
      <div className="nx-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-widest">
            <th className="p-3 text-left">Herramienta</th><th className="p-3 text-left">Plan</th><th className="p-3">Límite/mes</th><th className="p-3">Activa</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-white/5">
                <td className="p-3">{(TOOLS.find(t => t.slug === r.tool) || {}).name || r.tool}</td>
                <td className="p-3"><input className={sel + ' text-white w-40'} value={r.plan_name || ''} onChange={e => patch(r.id, 'plan_name', e.target.value)}/></td>
                <td className="p-3 text-center"><input type="number" className={numi} value={r.monthly_limit ?? 0} onChange={e => patch(r.id, 'monthly_limit', e.target.value)}/></td>
                <td className="p-3 text-center"><input type="checkbox" checked={!!r.enabled} onChange={e => patch(r.id, 'enabled', e.target.checked)} className="accent-[#00F0FF]"/></td>
                <td className="p-3 text-right"><button onClick={() => save(r)} className="nx-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1"><Save size={13}/>Guardar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <div className="text-sm text-[#00F0FF]">{msg}</div>}
    </div>
  );
}

function PacksAdmin() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [managing, setManaging] = useState(null);
  const blank = {
    name: '', slug: '', category: PACK_CATEGORIES[0].id, subcategory: '', tags: '',
    short_description: '', full_description: '', item_count: 0, formats: 'png',
    resolution_note: '300 DPI, fondo transparente', price: 0, promo_price: '', promo_start: '', promo_end: '',
    license_type: 'personal', license_notes: '', version: '1.0', status: 'borrador',
  };

  const load = () => pb.collection('image_packs').getFullList({ sort: '-created' }).then(setPacks).catch(() => setPacks([])).finally(() => setLoading(false));
  useEffect(load, []);

  const save = async () => {
    const data = { ...editing };
    data.price = +data.price || 0;
    data.promo_price = data.promo_price === '' ? 0 : +data.promo_price;
    data.item_count = +data.item_count || 0;
    if (!data.slug) data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    data.tags = typeof data.tags === 'string' ? data.tags.split(',').map(s => s.trim()).filter(Boolean) : data.tags;
    data.formats = typeof data.formats === 'string' ? data.formats.split(',').map(s => s.trim()).filter(Boolean) : data.formats;
    try {
      if (data.id) await pb.collection('image_packs').update(data.id, data);
      else await pb.collection('image_packs').create(data);
      setEditing(null); load();
    } catch (e) { alert(e?.message || 'Error al guardar el pack'); }
  };
  const del = async (id) => { if (!confirm('¿Eliminar pack? Se borran también sus imágenes.')) return; try { await pb.collection('image_packs').delete(id); load(); } catch { /* ignore */ } };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;

  if (managing) return <PackImagesAdmin pack={managing} onBack={() => setManaging(null)}/>;

  return (
    <div>
      <p className="text-white/55 text-sm mb-4">Biblioteca de Imágenes por Packs — se vende el pack completo, nunca imágenes sueltas.</p>
      <button onClick={() => setEditing(blank)} className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2 mb-6"><Plus size={16}/>Nuevo pack</button>
      {editing && (
        <div className="nx-card p-6 mb-6 grid sm:grid-cols-2 gap-4">
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Nombre</span><input className={numi + ' w-full'} value={editing.name} onChange={e => setEditing(x => ({ ...x, name: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Categoría</span>
            <select className={sel + ' w-full'} value={editing.category} onChange={e => setEditing(x => ({ ...x, category: e.target.value }))}>
              {PACK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Subcategoría</span><input className={numi + ' w-full'} value={editing.subcategory} onChange={e => setEditing(x => ({ ...x, subcategory: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Etiquetas (separadas por coma)</span><input className={numi + ' w-full'} value={Array.isArray(editing.tags) ? editing.tags.join(', ') : editing.tags} onChange={e => setEditing(x => ({ ...x, tags: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Descripción corta</span><input className={numi + ' w-full'} value={editing.short_description} onChange={e => setEditing(x => ({ ...x, short_description: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Descripción completa</span><textarea rows={3} className={numi + ' w-full'} value={editing.full_description} onChange={e => setEditing(x => ({ ...x, full_description: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Cantidad de imágenes</span><input type="number" className={numi + ' w-full'} value={editing.item_count} onChange={e => setEditing(x => ({ ...x, item_count: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Formatos (coma)</span><input className={numi + ' w-full'} value={Array.isArray(editing.formats) ? editing.formats.join(', ') : editing.formats} onChange={e => setEditing(x => ({ ...x, formats: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Nota de resolución/calidad</span><input className={numi + ' w-full'} value={editing.resolution_note} onChange={e => setEditing(x => ({ ...x, resolution_note: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Precio normal (MXN)</span><input type="number" className={numi + ' w-full'} value={editing.price} onChange={e => setEditing(x => ({ ...x, price: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Precio promo (0 = sin promo)</span><input type="number" className={numi + ' w-full'} value={editing.promo_price} onChange={e => setEditing(x => ({ ...x, promo_price: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Promo desde</span><input type="date" className={numi + ' w-full'} value={editing.promo_start?.slice(0, 10) || ''} onChange={e => setEditing(x => ({ ...x, promo_start: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Promo hasta</span><input type="date" className={numi + ' w-full'} value={editing.promo_end?.slice(0, 10) || ''} onChange={e => setEditing(x => ({ ...x, promo_end: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Licencia</span>
            <select className={sel + ' w-full'} value={editing.license_type} onChange={e => setEditing(x => ({ ...x, license_type: e.target.value }))}>
              <option value="personal">Personal</option>
              <option value="comercial">Comercial</option>
              <option value="no_reventa">Comercial, no reventa</option>
              <option value="exclusivo">Exclusivo</option>
            </select></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Versión</span><input className={numi + ' w-full'} value={editing.version} onChange={e => setEditing(x => ({ ...x, version: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Notas de licencia / usos permitidos</span><textarea rows={2} className={numi + ' w-full'} value={editing.license_notes} onChange={e => setEditing(x => ({ ...x, license_notes: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Estado</span>
            <select className={sel + ' w-full'} value={editing.status} onChange={e => setEditing(x => ({ ...x, status: e.target.value }))}>
              <option value="borrador">Borrador</option>
              <option value="publicado">Publicado</option>
              <option value="oculto">Oculto</option>
              <option value="agotado">Agotado / inactivo</option>
            </select></label>
          <div className="sm:col-span-2 flex gap-3"><button onClick={save} className="nx-btn-primary px-5 py-2.5">Guardar</button><button onClick={() => setEditing(null)} className="nx-btn-ghost px-5 py-2.5">Cancelar</button></div>
        </div>
      )}
      <div className="space-y-3">
        {packs.map(p => (
          <div key={p.id} className="nx-card p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-display">{p.name} {p.status !== 'publicado' && <span className="text-[#FF2D95] text-xs">({p.status})</span>}</div>
              <div className="text-xs text-white/40">{PACK_CATEGORIES.find(c => c.id === p.category)?.label} · {p.item_count} imágenes · {money(p.promo_price > 0 ? p.promo_price : p.price)} · v{p.version}</div>
            </div>
            <button onClick={() => setManaging(p)} className="nx-btn-ghost px-3 py-1.5 text-xs inline-flex items-center gap-1"><Images size={13}/>Imágenes</button>
            <button onClick={() => setEditing({ ...p, tags: (p.tags || []).join(', '), formats: (p.formats || []).join(', ') })} className="nx-btn-ghost px-3 py-1.5 text-xs">Editar</button>
            <button onClick={() => del(p.id)} className="text-[#FF2D95] p-2"><Trash2 size={16}/></button>
          </div>
        ))}
        {packs.length === 0 && <div className="nx-card p-16 text-center text-white/60">Sin packs todavía.</div>}
      </div>
    </div>
  );
}

function PackImagesAdmin({ pack, onBack }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', dominant_color: '', style: '', product_type: '' });
  const [thumbFile, setThumbFile] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => pb.collection('pack_images').getFullList({ filter: `pack = "${pack.id}"`, sort: 'sort' }).then(setImages).catch(() => setImages([])).finally(() => setLoading(false));
  useEffect(load, []);

  const addImage = async () => {
    if (!thumbFile || !originalFile) { setMsg('Sube la muestra y el archivo original.'); return; }
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      fd.append('pack', pack.id);
      fd.append('name', form.name || originalFile.name);
      fd.append('thumbnail', thumbFile);
      fd.append('dominant_color', form.dominant_color);
      fd.append('style', form.style);
      fd.append('product_type', form.product_type);
      fd.append('sort', images.length);
      const img = await pb.collection('pack_images').create(fd);

      const ofd = new FormData();
      ofd.append('pack', pack.id);
      ofd.append('pack_image', img.id);
      ofd.append('file', originalFile);
      await pb.collection('pack_originals').create(ofd);

      setForm({ name: '', dominant_color: '', style: '', product_type: '' });
      setThumbFile(null); setOriginalFile(null);
      load();
    } catch (e) { setMsg(e?.message || 'Error al subir la imagen.'); } finally { setBusy(false); }
  };
  const delImage = async (id) => { if (!confirm('¿Eliminar imagen del pack?')) return; try { await pb.collection('pack_images').delete(id); load(); } catch { /* ignore */ } };

  return (
    <div>
      <button onClick={onBack} className="nx-btn-ghost px-4 py-2 text-xs mb-6">← Volver a packs</button>
      <div className="font-display text-xl uppercase mb-4">{pack.name} <span className="text-white/40 text-sm">({images.length} imágenes)</span></div>

      <div className="nx-card p-6 mb-6 grid sm:grid-cols-2 gap-4">
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Nombre de la imagen</span><input className={numi + ' w-full'} value={form.name} onChange={e => setForm(x => ({ ...x, name: e.target.value }))}/></label>
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Color dominante</span><input className={numi + ' w-full'} value={form.dominant_color} onChange={e => setForm(x => ({ ...x, dominant_color: e.target.value }))}/></label>
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Estilo</span><input className={numi + ' w-full'} value={form.style} onChange={e => setForm(x => ({ ...x, style: e.target.value }))}/></label>
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Tipo de producto</span><input className={numi + ' w-full'} value={form.product_type} onChange={e => setForm(x => ({ ...x, product_type: e.target.value }))}/></label>
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Muestra pública (con marca de agua)</span><input type="file" accept="image/*" className={numi + ' w-full'} onChange={e => setThumbFile(e.target.files[0])}/></label>
        <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Archivo original (protegido)</span><input type="file" className={numi + ' w-full'} onChange={e => setOriginalFile(e.target.files[0])}/></label>
        <div className="sm:col-span-2 flex items-center gap-4">
          <button disabled={busy} onClick={addImage} className="nx-btn-primary px-5 py-2.5 inline-flex items-center gap-2"><Plus size={16}/>{busy ? 'Subiendo…' : 'Agregar imagen'}</button>
          {msg && <span className="text-sm text-[#FF2D95]">{msg}</span>}
        </div>
      </div>

      {loading ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div> : (
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map(img => (
            <div key={img.id} className="nx-card overflow-hidden">
              <div className="aspect-square nx-checker flex items-center justify-center overflow-hidden">
                {img.thumbnail ? <img src={pb.files.getUrl(img, img.thumbnail)} alt={img.name} className="max-w-full max-h-full object-contain"/> : <Images size={40} className="text-white/30"/>}
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="text-xs truncate">{img.name}</div>
                <button onClick={() => delImage(img.id)} className="text-[#FF2D95] shrink-0"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
          {images.length === 0 && <div className="col-span-full text-center text-white/50 py-10">Sin imágenes en este pack todavía.</div>}
        </div>
      )}
    </div>
  );
}

const ACTION_COLOR = { create: '#3ddc84', update: '#00F0FF', delete: '#FF2D95' };

function Bitacora() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    pb.collection('audit_logs').getList(1, 100, { sort: '-created' })
      .then(r => setLogs(r.items)).catch(() => setLogs([])).finally(() => setLoading(false));
  }, []);

  const filtered = filter ? logs.filter(l => l.collection_name === filter) : logs;
  const collections = [...new Set(logs.map(l => l.collection_name))];

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]"/></div>;
  return (
    <div>
      <p className="text-white/55 text-sm mb-4">Quién cambió qué en el panel administrativo — productos, precios, membresías, notificaciones, tools, packs y pedidos. Registro de solo lectura, no editable.</p>
      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-widest border ${filter === '' ? 'border-[#00F0FF] text-[#00F0FF]' : 'border-white/15 text-white/60'}`}>Todos</button>
          {collections.map(c => (
            <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-widest border ${filter === c ? 'border-[#00F0FF] text-[#00F0FF]' : 'border-white/15 text-white/60'}`}>{c}</button>
          ))}
        </div>
      )}
      <div className="nx-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-white/50 border-b border-white/10 text-xs uppercase tracking-widest">
            <th className="p-3">Fecha</th><th className="p-3">Quién</th><th className="p-3">Acción</th><th className="p-3">Colección</th><th className="p-3">Detalle</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {filtered.map(l => (
              <React.Fragment key={l.id}>
                <tr className="border-b border-white/5">
                  <td className="p-3 text-white/40 whitespace-nowrap">{new Date(l.created).toLocaleString('es-MX')}</td>
                  <td className="p-3 text-white/70">{l.actor_label}</td>
                  <td className="p-3"><span className="text-xs px-2 py-1 rounded-full font-display uppercase tracking-widest" style={{ color: ACTION_COLOR[l.action], background: ACTION_COLOR[l.action] + '18' }}>{l.action}</span></td>
                  <td className="p-3 text-white/70">{l.collection_name}</td>
                  <td className="p-3 text-white/50">{l.summary}</td>
                  <td className="p-3 text-right"><button onClick={() => setOpen(open === l.id ? null : l.id)} className="nx-btn-ghost px-3 py-1 text-xs">{open === l.id ? 'Ocultar' : 'Ver cambios'}</button></td>
                </tr>
                {open === l.id && (
                  <tr className="border-b border-white/5 bg-black/30">
                    <td colSpan={6} className="p-4">
                      <pre className="text-[11px] text-white/60 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(l.changes, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-white/50">Sin actividad registrada todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
