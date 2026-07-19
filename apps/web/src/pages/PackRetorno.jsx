import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';

const POLL_MS = 2500;
const TIMEOUT_MS = 45000;

export default function PackRetorno() {
  const [params] = useSearchParams();
  const purchaseId = params.get('purchase');
  const [purchase, setPurchase] = useState(null);
  const [err, setErr] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!purchaseId) { setErr('Falta la referencia de la compra.'); return; }
    let stop = false;

    const tick = async () => {
      try {
        const rec = await pb.collection('pack_purchases').getOne(purchaseId, { expand: 'pack' });
        if (stop) return;
        setPurchase(rec);
        if (rec.payment_status === 'pendiente' && Date.now() - startedAt.current < TIMEOUT_MS) {
          setTimeout(tick, POLL_MS);
        } else if (rec.payment_status === 'pendiente') {
          setTimedOut(true);
        }
      } catch (ex) {
        if (!stop) setErr(ex?.message || 'No se pudo consultar la compra.');
      }
    };
    tick();
    return () => { stop = true; };
  }, [purchaseId]);

  const packName = purchase?.expand?.pack?.name || 'tu pack';

  return (
    <PageShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        {err && <Status icon={<XCircle className="mx-auto text-[#FF2D95]" size={64}/>} title="No pudimos verificar tu compra" note={err}/>}

        {!err && !purchase && (
          <Status icon={<Loader2 className="mx-auto animate-spin text-[#00F0FF]" size={64}/>} title="Verificando tu pago" note="Estamos confirmando el resultado con Mercado Pago…"/>
        )}

        {!err && purchase && purchase.payment_status === 'pagado' && (
          <Status icon={<CheckCircle2 className="mx-auto text-[#00F0FF]" size={64}/>} title="¡Pack desbloqueado!" note={<>Ya tienes acceso completo a <b className="text-[#00AEEF]">{packName}</b>.</>}/>
        )}

        {!err && purchase && purchase.payment_status === 'fallido' && (
          <Status icon={<XCircle className="mx-auto text-[#FF2D95]" size={64}/>} title="El pago no se completó" note={<>Puedes reintentar la compra de <b>{packName}</b> desde su ficha.</>}/>
        )}

        {!err && purchase && purchase.payment_status === 'pendiente' && !timedOut && (
          <Status icon={<Loader2 className="mx-auto animate-spin text-[#00F0FF]" size={64}/>} title="Verificando tu pago" note="Mercado Pago todavía está procesando la confirmación…"/>
        )}

        {!err && purchase && purchase.payment_status === 'pendiente' && timedOut && (
          <Status icon={<Clock className="mx-auto text-white/50" size={64}/>} title="Seguimos esperando la confirmación" note={<>Puede tardar unos minutos más. Revisa "Mis Packs" en un momento.</>}/>
        )}

        <div className="mt-8 flex gap-3 justify-center">
          <Link to="/dashboard" className="nx-btn-primary px-6 py-3">Ver Mis Packs</Link>
          <Link to="/packs" className="nx-btn-ghost px-6 py-3">Seguir explorando</Link>
        </div>
      </div>
    </PageShell>
  );
}

function Status({ icon, title, note }) {
  return (
    <>
      {icon}
      <h1 className="font-display text-4xl font-black uppercase mt-6">{title}</h1>
      <p className="text-white/60 mt-3">{note}</p>
    </>
  );
}
