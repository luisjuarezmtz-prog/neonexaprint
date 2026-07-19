import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import { useMembership, isMembershipActive } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { money } from '@/lib/neonexa';
import { Package, FileImage, FileText, User2, Plus, MessageCircle, Shield, Loader2, ChevronRight, Bell, Crown, Wrench, Images, Download, MapPin, Trash2, Star } from 'lucide-react';
import { toolBySlug } from '@/lib/tools';

export const STATUS_META = {
  recibido: { label: 'Recibido', color: '#00AEEF' },
  en_revision: { label: 'En revisión', color: '#00F0FF' },
  requiere_correccion: { label: 'Requiere corrección', color: '#FFD400' },
  aprobado: { label: 'Aprobado', color: '#00F0FF' },
  en_produccion: { label: 'En producción', color: '#00AEEF' },
  listo: { label: 'Listo', color: '#00F0FF' },
  enviado: { label: 'Enviado', color: '#00AEEF' },
  entregado: { label: 'Entregado', color: '#3ddc84' },
  cancelado: { label: 'Cancelado', color: '#FF2D95' },
};
export const PAY_META = {
  pendiente: '#FFD400', pagado: '#3ddc84', fallido: '#FF2D95', reembolsado: '#00F0FF',
};
export const QUOTE_STATUS_META = {
  nueva: { label: 'Nueva', color: '#00AEEF' },
  en_revision: { label: 'En revisión', color: '#00F0FF' },
  cotizada: { label: 'Cotizada', color: '#FFD400' },
  aceptada: { label: 'Aceptada', color: '#3ddc84' },
  rechazada: { label: 'Rechazada', color: '#FF2D95' },
  expirada: { label: 'Expirada', color: '#888' },
};

const WHATSAPP_NUMBER = '56110050049';
const WHATSAPP_DISPLAY = '+56 1105 0049';
const WHATSAPP = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola Neonexa, necesito ayuda con mi cuenta.')}`;

export default function Dashboard() {
  const { user, isAuthed, isAdmin, isVerified, resendVerification, updateProfile } = useAuth();
  const [resendState, setResendState] = useState('idle'); // idle | sending | sent
  const { membership } = useMembership();
  const [tab, setTab] = useState('pedidos');
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [history, setHistory] = useState([]);
  const [toolJobs, setToolJobs] = useState([]);
  const [packPurchases, setPackPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthed) return;
    Promise.all([
      pb.collection('orders').getFullList({ sort: '-created', expand: 'order_items_via_order' }).catch(() => []),
      pb.collection('quotes').getFullList({ sort: '-created', expand: 'product' }).catch(() => []),
      pb.collection('files').getFullList({ sort: '-created', expand: 'order' }).catch(() => []),
      pb.collection('designs').getFullList({ sort: '-created' }).catch(() => []),
      pb.collection('notifications').getFullList({ sort: '-created' }).catch(() => []),
      pb.collection('membership_history').getFullList({ sort: '-created' }).catch(() => []),
      pb.collection('tool_jobs').getFullList({ sort: '-created' }).catch(() => []),
      pb.collection('pack_purchases').getFullList({ filter: 'payment_status = "pagado"', sort: '-created', expand: 'pack' }).catch(() => []),
    ]).then(([o, q, fl, d, n, h, tj, pp]) => { setOrders(o); setQuotes(q); setFiles(fl); setDesigns(d); setNotifs(n); setHistory(h); setToolJobs(tj); setPackPurchases(pp); }).finally(() => setLoading(false));
  }, [isAuthed]);

  const markRead = async (n) => {
    if (n.read) return;
    try { await pb.collection('notifications').update(n.id, { read: true }); setNotifs(p => p.map(x => x.id === n.id ? { ...x, read: true } : x)); } catch { /* ignore */ }
  };
  const unread = notifs.filter(n => !n.read).length;

  const resend = async () => {
    setResendState('sending');
    try { await resendVerification(); setResendState('sent'); } catch { setResendState('idle'); }
  };

  if (!isAuthed) return <Navigate to="/login" replace />;

  const tabs = [
    { id: 'pedidos', label: 'Pedidos', icon: Package },
    { id: 'cotizaciones', label: `Cotizaciones${quotes.length ? ` (${quotes.length})` : ''}`, icon: FileText },
    { id: 'notificaciones', label: `Notificaciones${unread ? ` (${unread})` : ''}`, icon: Bell },
    { id: 'membresia', label: 'Membresía', icon: Crown },
    { id: 'packs', label: 'Mis Packs', icon: Images },
    { id: 'trabajos', label: 'Trabajos Tools', icon: Wrench },
    { id: 'archivos', label: 'Archivos', icon: FileImage },
    { id: 'datos', label: 'Mis datos', icon: User2 },
  ];

  return (
    <PageShell>
      <div className="max-w-[90rem] mx-auto px-6 pt-14 pb-24">
        <div className="flex items-end justify-between flex-wrap gap-6">
          <div>
            <div className="font-display tracking-[0.4em] text-[#00F0FF] text-xs">MI CUENTA</div>
            <h1 className="font-display text-5xl md:text-6xl font-black mt-3 uppercase">Hola, <span className="text-[#00AEEF]">{user?.name || 'creador'}</span></h1>
          </div>
          <div className="flex gap-3 flex-wrap">
            {isAdmin && <Link to="/admin" className="nx-btn-ghost px-5 py-3 inline-flex items-center gap-2"><Shield size={16}/>Admin</Link>}
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" aria-label={`Soporte por WhatsApp al ${WHATSAPP_DISPLAY}`} className="nx-btn-ghost px-5 py-3 inline-flex items-center gap-2"><MessageCircle size={16}/>Soporte {WHATSAPP_DISPLAY}</a>
            <Link to="/dtf/textil" className="nx-btn-primary px-5 py-3 inline-flex items-center gap-2"><Plus size={16}/>Nuevo pedido</Link>
          </div>
        </div>

        {!isVerified && (
          <div className="mt-6 nx-card p-4 border border-[#FFD400]/40 bg-[#FFD400]/5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/70">Tu correo <b>{user?.email}</b> aún no está verificado. Revisa tu bandeja de entrada para confirmarlo.</div>
            {resendState === 'sent' ? (
              <span className="text-xs text-[#3ddc84] font-display uppercase tracking-widest">Correo reenviado</span>
            ) : (
              <button onClick={resend} disabled={resendState === 'sending'} className="nx-btn-ghost px-4 py-2 text-xs shrink-0">
                {resendState === 'sending' ? 'Enviando…' : 'Reenviar correo de verificación'}
              </button>
            )}
          </div>
        )}

        <div className="mt-10 flex gap-2 border-b border-white/10">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-5 py-3 font-display text-xs uppercase tracking-widest flex items-center gap-2 border-b-2 -mb-px transition ${tab === t.id ? 'border-[#00AEEF] text-[#00F0FF]' : 'border-transparent text-white/50 hover:text-white'}`}>
                <Icon size={14}/>{t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div>
        ) : (
          <div className="mt-8">
            {tab === 'pedidos' && <Orders orders={orders} designs={designs}/>}
            {tab === 'cotizaciones' && <Cotizaciones quotes={quotes}/>}
            {tab === 'notificaciones' && <Notifs notifs={notifs} markRead={markRead}/>}
            {tab === 'membresia' && <Membresia membership={membership} history={history}/>}
            {tab === 'packs' && <MisPacks purchases={packPurchases}/>}
            {tab === 'trabajos' && <ToolJobs jobs={toolJobs}/>}
            {tab === 'archivos' && <Files files={files}/>}
            {tab === 'datos' && (
              <div className="space-y-6">
                <Datos user={user} updateProfile={updateProfile}/>
                <Addresses/>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Orders({ orders, designs }) {
  if (orders.length === 0) {
    return (
      <div className="nx-card p-16 text-center">
        <div className="font-display text-2xl uppercase">Aún no tienes pedidos</div>
        <p className="text-white/60 mt-2">Crea tu primer pedido de impresión DTF.</p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <Link to="/dtf/textil" className="nx-btn-primary px-5 py-3">DTF Textil</Link>
          <Link to="/dtf/uv" className="nx-btn-ghost px-5 py-3">DTF UV</Link>
        </div>
        {designs.length > 0 && <p className="text-white/40 text-xs mt-6">Tienes {designs.length} diseño(s) guardado(s) en herramientas.</p>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {orders.map(o => {
        const meta = STATUS_META[o.status] || STATUS_META.recibido;
        return (
          <div key={o.id} className="nx-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg">{o.folio}</div>
                <div className="text-xs text-white/40">{new Date(o.created).toLocaleString('es-MX')}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-3 py-1 rounded-full font-display uppercase tracking-widest" style={{ color: meta.color, background: meta.color + '18' }}>{meta.label}</span>
                <span className="text-xs px-3 py-1 rounded-full font-display uppercase tracking-widest" style={{ color: PAY_META[o.payment_status] || '#888', background: (PAY_META[o.payment_status] || '#888') + '18' }}>{o.payment_status || 'sin pago'}</span>
                <span className="font-display font-black text-[#00AEEF]">{money(o.totals?.total, o.totals?.currency || 'MXN')}</span>
              </div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 gap-2 text-sm text-white/60">
              {(o.expand?.order_items_via_order || []).map((it) => (
                <div key={it.id} className="flex items-center gap-2"><ChevronRight size={12} className="text-[#00AEEF]"/>{it.title}</div>
              ))}
            </div>
            {(o.events || []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40">
                {o.events.map((e, i) => (
                  <span key={i}>{STATUS_META[e.status]?.label || e.status} · {new Date(e.at).toLocaleDateString('es-MX')}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Cotizaciones({ quotes }) {
  if (quotes.length === 0) {
    return (
      <div className="nx-card p-16 text-center">
        <div className="font-display text-2xl uppercase">Sin solicitudes de cotización</div>
        <p className="text-white/60 mt-2">Los kits corporativos y proyectos especiales se cotizan a la medida.</p>
        <div className="mt-6"><Link to="/personalizados" className="nx-btn-primary px-5 py-3">Ver catálogo</Link></div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {quotes.map(q => {
        const meta = QUOTE_STATUS_META[q.status] || QUOTE_STATUS_META.nueva;
        return (
          <div key={q.id} className="nx-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-display text-lg">{q.folio}</div>
                <div className="text-xs text-white/40">{q.expand?.product?.name || 'Producto'} · {new Date(q.created).toLocaleString('es-MX')}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-3 py-1 rounded-full font-display uppercase tracking-widest" style={{ color: meta.color, background: meta.color + '18' }}>{meta.label}</span>
                {q.quoted_amount != null && <span className="font-display font-black text-[#00AEEF]">{money(q.quoted_amount)}</span>}
              </div>
            </div>
            <div className="mt-3 text-sm text-white/60">Cantidad estimada: {q.qty}{q.company ? ` · ${q.company}` : ''}</div>
            {q.quoted_notes && <div className="mt-2 text-sm text-white/50">{q.quoted_notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Notifs({ notifs, markRead }) {
  if (notifs.length === 0) return <div className="nx-card p-16 text-center text-white/60">No tienes notificaciones. Aquí verás avisos de tus pedidos, archivos y membresía.</div>;
  return (
    <div className="space-y-3">
      {notifs.map(n => (
        <button key={n.id} onClick={() => markRead(n)} className={`w-full text-left nx-card p-4 flex gap-3 items-start transition ${n.read ? 'opacity-60' : ''}`}>
          <Bell size={18} className={n.read ? 'text-white/40 mt-0.5' : 'text-[#00F0FF] mt-0.5'}/>
          <div className="flex-1">
            <div className="font-display text-sm">{n.title}</div>
            {n.message && <div className="text-sm text-white/60 mt-1">{n.message}</div>}
            <div className="text-[11px] text-white/35 mt-2">{new Date(n.created).toLocaleString('es-MX')}{!n.read && <span className="ml-2 text-[#FF2D95]">nuevo</span>}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function Membresia({ membership, history }) {
  const active = isMembershipActive(membership);
  return (
    <div className="space-y-6">
      <div className="nx-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/50">Estado de membresía</div>
          <div className="font-display text-2xl font-black mt-1">{membership?.expand?.plan?.name || (membership ? 'Plan Neonexa' : 'Sin membresía')}</div>
          {membership?.period_end && <div className="text-sm text-white/60 mt-1">Vigente hasta {new Date(membership.period_end).toLocaleDateString('es-MX')}</div>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm px-4 py-1.5 rounded-full font-display uppercase tracking-widest" style={{ color: active ? '#3ddc84' : '#FF2D95', background: (active ? '#3ddc84' : '#FF2D95') + '20' }}>{active ? 'Activa' : (membership?.status || 'inactiva')}</span>
          <Link to="/membresias" className="nx-btn-ghost px-4 py-2.5">Gestionar</Link>
        </div>
      </div>
      {history.length > 0 && (
        <div className="nx-card overflow-hidden">
          <div className="p-4 font-display text-sm uppercase tracking-widest text-white/60 border-b border-white/10">Historial de facturación</div>
          <table className="w-full text-sm">
            <tbody>
              {history.map(h => (
                <tr key={h.id} className="border-b border-white/5">
                  <td className="p-4 text-white/50">{new Date(h.created).toLocaleDateString('es-MX')}</td>
                  <td className="p-4 uppercase text-xs tracking-widest text-[#00F0FF]">{h.action.replace(/_/g, ' ')}</td>
                  <td className="p-4 text-white/70">{h.note}</td>
                  <td className="p-4 font-display text-right">{h.amount ? money(h.amount, h.currency) : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MisPacks({ purchases }) {
  if (purchases.length === 0) {
    return (
      <div className="nx-card p-16 text-center">
        <div className="font-display text-2xl uppercase">Aún no tienes packs</div>
        <p className="text-white/60 mt-2">Explora la biblioteca de imágenes por packs.</p>
        <Link to="/packs" className="nx-btn-primary px-5 py-3 inline-block mt-6">Ver packs</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {purchases.map(p => <MiPack key={p.id} purchase={p}/>)}
    </div>
  );
}

function MiPack({ purchase }) {
  const pack = purchase.expand?.pack;
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    if (!pack) { setLoading(false); return; }
    pb.collection('pack_images').getFullList({ filter: `pack = "${pack.id}"`, sort: 'sort' })
      .then(setImages).catch(() => setImages([])).finally(() => setLoading(false));
  }, [pack]);

  const download = async (img) => {
    setDownloading(img.id);
    try {
      const { url } = await pb.send('/api/packs/download', { method: 'POST', body: { packImageId: img.id } });
      window.open(url, '_blank');
    } catch { /* ignore */ } finally { setDownloading(null); }
  };

  if (!pack) return null;
  return (
    <div className="nx-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-display text-lg">{pack.name}</div>
        <div className="text-xs text-white/40">Comprado {new Date(purchase.created).toLocaleDateString('es-MX')} · v{purchase.version_purchased}</div>
      </div>
      {loading ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={20}/></div> : (
        <div className="mt-4 grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map(img => (
            <div key={img.id} className="nx-card overflow-hidden">
              <div className="aspect-square nx-checker flex items-center justify-center overflow-hidden">
                {img.thumbnail ? <img src={pb.files.getUrl(img, img.thumbnail)} alt={img.name} className="w-full h-full object-cover"/> : <FileImage size={32} className="text-white/30"/>}
              </div>
              <button onClick={() => download(img)} disabled={downloading === img.id} className="w-full p-2 text-xs flex items-center justify-center gap-1.5 text-[#00F0FF] hover:bg-white/5">
                {downloading === img.id ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>} Descargar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolJobs({ jobs }) {
  if (jobs.length === 0) return <div className="nx-card p-16 text-center text-white/60">Aún no has usado Neonexa Tools. <Link to="/tools" className="text-[#00F0FF] underline">Explora las 10 herramientas</Link>.</div>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {jobs.map(j => {
        const tool = toolBySlug(j.tool);
        return (
          <div key={j.id} className="nx-card p-4 flex gap-3">
            <div className="w-16 h-16 rounded nx-checker overflow-hidden shrink-0">{(j.output_preview || j.input_preview) ? <img src={j.output_preview || j.input_preview} alt="" className="w-full h-full object-cover"/> : <FileImage size={24} className="text-white/30 m-auto mt-5"/>}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-widest text-[#00AEEF]">{tool?.name || j.tool}</div>
              <div className="text-sm truncate mt-0.5">{j.title || j.input_name || 'Trabajo'}</div>
              <div className="text-[11px] text-white/40 mt-1">{new Date(j.created).toLocaleString('es-MX')}</div>
              <div className="text-[11px] mt-1" style={{ color: j.status === 'error' ? '#FF2D95' : '#3ddc84' }}>{j.status}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FILE_KIND_LABEL = { original: 'Original', processed: 'Procesado', approved: 'Aprobado', production: 'Producción' };

function Files({ files }) {
  if (files.length === 0) return <div className="nx-card p-16 text-center text-white/60">No tienes archivos cargados todavía. Al crear un pedido, tus archivos originales se guardan aquí de forma privada.</div>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {files.map(f => (
        <div key={f.id} className="nx-card overflow-hidden">
          <div className="aspect-square nx-checker flex items-center justify-center overflow-hidden">
            {f.preview ? <img src={f.preview} alt={f.name} className="max-w-full max-h-full object-contain"/> : <FileImage size={48} className="text-white/30"/>}
          </div>
          <div className="p-3">
            <div className="text-sm font-medium truncate">{f.name}</div>
            <div className="text-[11px] text-white/40 mt-1 uppercase tracking-widest">{FILE_KIND_LABEL[f.kind] || f.kind}</div>
            {f.expand?.order?.folio && <div className="text-[11px] text-[#00F0FF]/70 mt-0.5">Pedido {f.expand.order.folio}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Addresses({ selectable, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const blank = { label: '', street: '', city: '', state: '', zip: '', phone: '', is_default: false };

  const load = () => pb.collection('addresses').getFullList({ sort: '-is_default,-created' }).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  useEffect(load, []);

  const save = async () => {
    const data = { ...editing, owner: pb.authStore.record.id };
    try {
      if (data.id) await pb.collection('addresses').update(data.id, data);
      else await pb.collection('addresses').create(data);
      setEditing(null); load();
    } catch (e) { alert(e?.message || 'No se pudo guardar la dirección.'); }
  };
  const del = async (id) => { if (!confirm('¿Eliminar esta dirección?')) return; try { await pb.collection('addresses').delete(id); load(); } catch { /* ignore */ } };
  const makeDefault = async (a) => {
    try {
      await Promise.all(items.filter(x => x.is_default && x.id !== a.id).map(x => pb.collection('addresses').update(x.id, { is_default: false })));
      await pb.collection('addresses').update(a.id, { is_default: true });
      load();
    } catch { /* ignore */ }
  };

  const inp = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]";

  if (loading) return <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={24}/></div>;

  return (
    <div className="nx-card p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF] flex items-center gap-2"><MapPin size={16}/>Mis direcciones</div>
        <button onClick={() => setEditing(blank)} className="nx-btn-ghost px-4 py-2 text-xs inline-flex items-center gap-1"><Plus size={14}/>Nueva</button>
      </div>

      {editing && (
        <div className="border border-[#00AEEF]/20 rounded p-4 mb-4 grid sm:grid-cols-2 gap-3">
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Etiqueta</span><input className={inp} placeholder="Casa, oficina…" value={editing.label} onChange={e => setEditing(x => ({ ...x, label: e.target.value }))}/></label>
          <label className="text-xs sm:col-span-2"><span className="uppercase tracking-widest text-white/50 block mb-1">Calle y número</span><input className={inp} value={editing.street} onChange={e => setEditing(x => ({ ...x, street: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Ciudad</span><input className={inp} value={editing.city} onChange={e => setEditing(x => ({ ...x, city: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Estado</span><input className={inp} value={editing.state} onChange={e => setEditing(x => ({ ...x, state: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">C.P.</span><input className={inp} value={editing.zip} onChange={e => setEditing(x => ({ ...x, zip: e.target.value }))}/></label>
          <label className="text-xs"><span className="uppercase tracking-widest text-white/50 block mb-1">Teléfono</span><input className={inp} value={editing.phone} onChange={e => setEditing(x => ({ ...x, phone: e.target.value }))}/></label>
          <div className="sm:col-span-2 flex gap-3"><button onClick={save} className="nx-btn-primary px-5 py-2 text-sm">Guardar</button><button onClick={() => setEditing(null)} className="nx-btn-ghost px-5 py-2 text-sm">Cancelar</button></div>
        </div>
      )}

      <div className="space-y-2">
        {items.map(a => (
          <div key={a.id} className={`p-3 rounded border flex items-center gap-3 ${selectable && selectedId === a.id ? 'border-[#00F0FF] bg-[#00AEEF]/10' : 'border-white/10'}`}>
            {selectable && <input type="radio" checked={selectedId === a.id} onChange={() => onSelect(a)} className="accent-[#00F0FF]"/>}
            <div className="flex-1 min-w-0">
              <div className="text-sm flex items-center gap-2">{a.label} {a.is_default && <span className="text-[10px] text-[#FFD400] uppercase tracking-widest">Predeterminada</span>}</div>
              <div className="text-xs text-white/50 truncate">{a.street}, {a.city}, {a.state} {a.zip}</div>
            </div>
            {!selectable && (
              <div className="flex items-center gap-2 shrink-0">
                {!a.is_default && <button onClick={() => makeDefault(a)} className="text-white/40 hover:text-[#FFD400]" title="Hacer predeterminada"><Star size={15}/></button>}
                <button onClick={() => setEditing(a)} className="nx-btn-ghost px-2 py-1 text-xs">Editar</button>
                <button onClick={() => del(a.id)} className="text-[#FF2D95]"><Trash2 size={15}/></button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="text-white/40 text-sm py-4 text-center">Sin direcciones guardadas.</div>}
      </div>
    </div>
  );
}

function Datos({ user, updateProfile }) {
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', company: user?.company || '', rfc: user?.rfc || '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
  const inp = "w-full bg-black/50 border border-[#00AEEF]/30 px-3 py-2 rounded text-white text-sm focus:outline-none focus:border-[#00F0FF]";
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await updateProfile(f); setMsg('Datos actualizados.'); } catch { setMsg('No se pudo guardar.'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="nx-card p-6 max-w-2xl grid sm:grid-cols-2 gap-4">
      <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">Nombre</span><input className={inp + ' mt-2'} value={f.name} onChange={set('name')}/></label>
      <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">Teléfono / WhatsApp</span><input className={inp + ' mt-2'} value={f.phone} onChange={set('phone')}/></label>
      <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">Email</span><input className={inp + ' mt-2 opacity-60'} value={user?.email} disabled/></label>
      <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">Empresa</span><input className={inp + ' mt-2'} value={f.company} onChange={set('company')}/></label>
      <label className="block"><span className="text-xs uppercase tracking-widest text-white/60">RFC</span><input className={inp + ' mt-2'} value={f.rfc} onChange={set('rfc')}/></label>
      <div className="sm:col-span-2 flex items-center gap-4">
        <button disabled={busy} className="nx-btn-primary px-6 py-3">{busy ? 'Guardando…' : 'Guardar datos'}</button>
        {msg && <span className="text-sm text-[#00F0FF]">{msg}</span>}
      </div>
    </form>
  );
}
