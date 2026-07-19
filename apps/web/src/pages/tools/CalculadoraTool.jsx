import React, { useEffect, useState } from 'react';
import ToolShell, { labelCls, inputCls } from '@/components/ToolShell';
import { recordJob, logUsage, checkLimit } from '@/lib/tools';
import { useMembership } from '@/lib/membership';
import { money } from '@/lib/neonexa';
import pb from '@/lib/pocketbaseClient';
import { History } from 'lucide-react';

export default function CalculadoraTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;
  const [f, setF] = useState({
    meters: 5, widthM: 0.6, materialPerM: 45, inkPerM: 35, laborPerM: 25, wastePct: 10, marginPct: 40, qty: 1,
  });
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: +e.target.value }));

  const loadJobs = () => pb.collection('tool_jobs').getList(1, 6, { filter: pb.filter('tool = {:t}', { t: 'calculadora' }), sort: '-created' }).then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit('calculadora', planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const totalMeters = f.meters * f.qty;
  const base = (f.materialPerM + f.inkPerM + f.laborPerM) * totalMeters;
  const waste = base * (f.wastePct / 100);
  const cost = base + waste;
  const margin = cost * (f.marginPct / 100);
  const price = cost + margin;
  const perM = totalMeters ? price / totalMeters : 0;

  const save = async () => {
    setErr('');
    const chk = await checkLimit('calculadora', planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    await recordJob({ tool: 'calculadora', title: `Cotización ${totalMeters.toFixed(2)}m`, status: 'done', params: f, result: { cost, price, perM } });
    await logUsage('calculadora', 'calc', {});
    loadJobs();
  };

  const rows = [
    ['Material', (f.materialPerM * totalMeters)],
    ['Tinta', (f.inkPerM * totalMeters)],
    ['Mano de obra', (f.laborPerM * totalMeters)],
    [`Merma (${f.wastePct}%)`, waste],
  ];

  const fields = [
    ['meters', 'Metros por pieza'], ['qty', 'Cantidad de piezas'], ['widthM', 'Ancho útil (m)'],
    ['materialPerM', 'Material $/m'], ['inkPerM', 'Tinta $/m'], ['laborPerM', 'Mano de obra $/m'],
    ['wastePct', 'Merma %'], ['marginPct', 'Margen %'],
  ];

  const sidebar = (
    <div className="space-y-6">
      <button onClick={save} disabled={limit && !limit.allowed} className="nx-btn-primary w-full py-3 disabled:opacity-40">Guardar cotización</button>
      {err && <div className="text-[#FF2D95] text-xs">{err}</div>}
      {limit && limit.remaining >= 0 && (
        <div className="text-[11px] text-white/40 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
      )}
      {jobs.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 flex items-center gap-2"><History size={13}/>Historial</div>
          <div className="mt-3 space-y-2 text-xs">
            {jobs.map((j) => (
              <div key={j.id} className="flex justify-between text-white/60">
                <span className="truncate">{j.title}</span>
                <span className="text-[#00F0FF]">{money(j.result?.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolShell eyebrow="NEONEXA TOOLS" title="Calculadora inteligente de costos" subtitle="Calcula metros, material, tinta, mano de obra, merma, margen y precio sugerido." sidebar={sidebar}>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="grid grid-cols-2 gap-4">
          {fields.map(([k, label]) => (
            <label key={k} className="block">
              <span className={labelCls}>{label}</span>
              <input type="number" step="0.01" value={f[k]} onChange={set(k)} className={inputCls} />
            </label>
          ))}
        </div>
        <div className="nx-card p-6 self-start">
          <div className="text-xs uppercase tracking-widest text-white/50">Desglose · {totalMeters.toFixed(2)} m totales</div>
          <div className="mt-4 space-y-2 text-sm">
            {rows.map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-white/5 pb-2"><span className="text-white/60">{l}</span><span>{money(v)}</span></div>
            ))}
            <div className="flex justify-between pt-1"><span className="text-white/60">Costo total</span><span className="font-display">{money(cost)}</span></div>
            <div className="flex justify-between"><span className="text-white/60">Margen ({f.marginPct}%)</span><span>{money(margin)}</span></div>
          </div>
          <div className="mt-5 pt-4 border-t border-[#00AEEF]/30">
            <div className="text-xs uppercase tracking-widest text-white/50">Precio sugerido</div>
            <div className="font-display text-4xl font-black text-[#00AEEF] mt-1">{money(price)}</div>
            <div className="text-white/50 text-sm mt-1">{money(perM)} por metro</div>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
