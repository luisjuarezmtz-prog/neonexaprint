import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import { money } from '@/lib/neonexa';
import { PACK_CATEGORIES, effectivePrice } from '@/pages/Packs';
import { Loader2, Images, ShieldCheck, CreditCard } from 'lucide-react';

const LICENSE_LABEL = {
  personal: 'Uso personal',
  comercial: 'Uso comercial',
  no_reventa: 'Uso comercial, no reventa',
  exclusivo: 'Licencia exclusiva',
};

export default function PackDetail() {
  const { slug } = useParams();
  const { isAuthed } = useAuth();
  const nav = useNavigate();
  const [pack, setPack] = useState(null);
  const [images, setImages] = useState([]);
  const [owned, setOwned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await pb.collection('image_packs').getFirstListItem(`slug="${slug}"`);
        setPack(p);
        const imgs = await pb.collection('pack_images').getFullList({ filter: `pack = "${p.id}"`, sort: 'sort' });
        setImages(imgs);
        if (isAuthed) {
          const purchase = await pb.collection('pack_purchases').getFirstListItem(
            `pack = "${p.id}" && owner = "${pb.authStore.record.id}" && payment_status = "pagado"`
          ).catch(() => null);
          setOwned(!!purchase);
        }
      } catch { setPack(null); } finally { setLoading(false); }
    })();
  }, [slug, isAuthed]);

  const comprar = async () => {
    if (!isAuthed) { nav('/login', { state: { from: `/packs/${slug}` } }); return; }
    setBusy(true); setErr('');
    try {
      const { init_point } = await pb.send('/api/mp/pack-preference', { method: 'POST', body: { packId: pack.id } });
      window.location.href = init_point;
    } catch (ex) {
      setErr(ex?.message || 'No se pudo iniciar el pago.');
    } finally { setBusy(false); }
  };

  if (loading) return <PageShell><div className="py-24 flex justify-center"><Loader2 className="animate-spin text-[#00AEEF]" size={40}/></div></PageShell>;
  if (!pack) return <Navigate to="/packs" replace/>;

  const { price, onPromo, original } = effectivePrice(pack);

  return (
    <PageShell>
      <div className="max-w-[80rem] mx-auto px-6 pt-14 pb-24">
        <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-start">
          <div>
            <span className="text-[10px] font-display tracking-widest bg-[#0B0B0B]/80 text-[#00F0FF] border border-[#00F0FF]/30 px-2 py-1">{PACK_CATEGORIES.find(c => c.id === pack.category)?.label}</span>
            <h1 className="font-display text-4xl md:text-5xl font-black uppercase mt-4">{pack.name}</h1>
            <p className="text-white/65 mt-3 max-w-2xl">{pack.full_description || pack.short_description}</p>

            <div className="mt-8">
              <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF] mb-3">Muestras {owned ? '(ya son tuyas)' : '(vista previa protegida)'}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map(img => (
                  <div key={img.id} className="nx-card overflow-hidden aspect-square nx-checker flex items-center justify-center">
                    {img.thumbnail ? <img src={pb.files.getURL(img, img.thumbnail)} alt={img.name} className="w-full h-full object-cover"/> : <Images size={32} className="text-white/30"/>}
                  </div>
                ))}
                {images.length === 0 && <div className="col-span-full text-white/40 text-sm">Aún no hay muestras cargadas.</div>}
              </div>
            </div>
          </div>

          <aside className="nx-card p-6 lg:sticky lg:top-24">
            <div className="text-xs uppercase tracking-widest text-white/50">Precio del pack</div>
            <div className="mt-2 flex items-center gap-2">
              {onPromo && <span className="text-white/40 line-through">{money(original, 'MXN')}</span>}
              <span className="font-display text-3xl font-black text-[#00AEEF]">{money(price, 'MXN')}</span>
            </div>
            <div className="mt-4 space-y-2 text-sm text-white/70">
              <div className="flex justify-between"><span className="text-white/50">Imágenes incluidas</span><span>{pack.item_count}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Formatos</span><span>{(pack.formats || []).join(', ').toUpperCase()}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Calidad</span><span className="text-right">{pack.resolution_note}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Licencia</span><span>{LICENSE_LABEL[pack.license_type] || pack.license_type}</span></div>
              <div className="flex justify-between"><span className="text-white/50">Versión</span><span>{pack.version}</span></div>
            </div>
            {pack.license_notes && <p className="text-white/40 text-xs mt-3">{pack.license_notes}</p>}

            {owned ? (
              <Link to="/dashboard" className="mt-6 nx-btn-primary w-full py-3 flex items-center justify-center gap-2"><ShieldCheck size={16}/>Ya lo compraste — ver en Mis Packs</Link>
            ) : (
              <button disabled={busy} onClick={comprar} className="mt-6 nx-btn-primary w-full py-3 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="animate-spin" size={16}/> : <CreditCard size={16}/>} Comprar pack completo
              </button>
            )}
            {err && <div className="text-[#FF2D95] text-sm mt-3">{err}</div>}
            <p className="text-[10px] text-white/35 mt-3 leading-relaxed">Se vende el pack completo, no imágenes sueltas. El acceso se desbloquea automáticamente al confirmarse el pago.</p>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}
