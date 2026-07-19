import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageShell from '@/components/PageShell';
import pb from '@/lib/pocketbaseClient';
import { useMembership } from '@/lib/membership';
import { Loader2, CheckCircle2, Clock, XCircle } from 'lucide-react';

const POLL_MS = 2500;
const TIMEOUT_MS = 45000;

export default function MembresiasRetorno() {
  const [params] = useSearchParams();
  const historyId = params.get('history');
  const { refresh } = useMembership();
  const [history, setHistory] = useState(null);
  const [err, setErr] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!historyId) { setErr('Falta la referencia del pago.'); return; }
    let stop = false;

    const tick = async () => {
      try {
        const rec = await pb.collection('membership_history').getOne(historyId, { expand: 'plan' });
        if (stop) return;
        setHistory(rec);
        if (rec.payment_status === 'pagado') { refresh(); return; }
        if (rec.payment_status === 'pendiente' && Date.now() - startedAt.current < TIMEOUT_MS) {
          setTimeout(tick, POLL_MS);
        } else if (rec.payment_status === 'pendiente') {
          setTimedOut(true);
        }
      } catch (ex) {
        if (!stop) setErr(ex?.message || 'No se pudo consultar el pago.');
      }
    };
    tick();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyId]);

  const planName = history?.expand?.plan?.name || 'tu plan';

  return (
    <PageShell>
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        {err && <Status icon={<XCircle className="mx-auto text-[#FF2D95]" size={64}/>} title="No pudimos verificar tu pago" note={err}/>}

        {!err && !history && (
          <Status icon={<Loader2 className="mx-auto animate-spin text-[#00F0FF]" size={64}/>} title="Verificando tu pago" note="Estamos confirmando el resultado con Mercado Pago…"/>
        )}

        {!err && history && history.payment_status === 'pagado' && (
          <Status icon={<CheckCircle2 className="mx-auto text-[#00F0FF]" size={64}/>} title="¡Membresía activa!" note={<>Ya tienes acceso a <b className="text-[#00AEEF]">{planName}</b>.</>}/>
        )}

        {!err && history && history.payment_status === 'fallido' && (
          <Status icon={<XCircle className="mx-auto text-[#FF2D95]" size={64}/>} title="El pago no se completó" note="Puedes reintentar la suscripción desde Membresías."/>
        )}

        {!err && history && history.payment_status === 'pendiente' && !timedOut && (
          <Status icon={<Loader2 className="mx-auto animate-spin text-[#00F0FF]" size={64}/>} title="Verificando tu pago" note="Mercado Pago todavía está procesando la confirmación…"/>
        )}

        {!err && history && history.payment_status === 'pendiente' && timedOut && (
          <Status icon={<Clock className="mx-auto text-white/50" size={64}/>} title="Seguimos esperando la confirmación" note="Puede tardar unos minutos más. Revisa tu membresía en un momento."/>
        )}

        <div className="mt-8 flex gap-3 justify-center">
          <Link to="/dashboard" className="nx-btn-primary px-6 py-3">Ir a mi panel</Link>
          <Link to="/membresias" className="nx-btn-ghost px-6 py-3">Ver membresías</Link>
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
