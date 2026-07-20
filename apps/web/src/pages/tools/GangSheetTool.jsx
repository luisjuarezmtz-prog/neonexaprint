import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, dataUrlToBlob, getJobResultUrl } from '@/lib/tools';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, X, Loader2, Download } from 'lucide-react';

const DPI = 150;

// Best-Fit Decreasing Height shelf packing — sorts tallest-first, then backfills
// existing shelves (rows) before opening a new one, instead of always wrapping to
// a fresh row in upload order. Meaningfully denser than naive left-to-right wrap.
// Never rotates artwork: a printed design must stay right-side-up on the garment.
function packShelfBFDH(entries, sheetPx, gapPx) {
  const sorted = [...entries].sort((a, b) => b.h - a.h);
  const shelves = []; // { y, height, usedWidth }
  const placements = [];
  for (const { it, w, h } of sorted) {
    let bestShelf = null, bestLeftover = Infinity;
    for (const shelf of shelves) {
      if (h <= shelf.height && shelf.usedWidth + w + gapPx <= sheetPx) {
        const leftover = sheetPx - (shelf.usedWidth + w + gapPx);
        if (leftover < bestLeftover) { bestLeftover = leftover; bestShelf = shelf; }
      }
    }
    if (bestShelf) {
      placements.push({ it, x: bestShelf.usedWidth + gapPx, y: bestShelf.y, w, h });
      bestShelf.usedWidth += w + gapPx;
    } else {
      const y = shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gapPx : gapPx;
      const shelf = { y, height: h, usedWidth: 0 };
      shelves.push(shelf);
      placements.push({ it, x: gapPx, y, w, h });
      shelf.usedWidth += w + gapPx;
    }
  }
  const totalH = shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gapPx : gapPx;
  return { placements, totalH };
}

export default function GangSheetTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;
  const [items, setItems] = useState([]); // {img, url, name, wCm}
  const [sheetW, setSheetW] = useState(58); // cm imprimible
  const [gap, setGap] = useState(0.5);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);
  const canvasRef = useRef(null);

  const loadJobs = () => pb.collection('tool_jobs').getList(1, 6, { filter: pb.filter('tool = {:t}', { t: 'gang-sheet' }), sort: '-created' }).then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit('gang-sheet', planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const onFiles = async (files) => {
    setErr('');
    for (const f of files) {
      try {
        const { img, url } = await loadImageFromFile(f);
        setItems((p) => [...p, { img, url, name: f.name, wCm: 10 }]);
      } catch (e) { setErr(String(e.message || e)); }
    }
  };
  const remove = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const setW = (i, w) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, wCm: w } : it));

  const build = async () => {
    if (items.length === 0) return;
    const chk = await checkLimit('gang-sheet', planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setBusy(true); setErr(''); setOut(null);
    try {
      const px = (cm) => Math.round((cm / 2.54) * DPI);
      const sheetPx = px(sheetW);
      const gapPx = px(gap);
      const dims = items.map((it) => {
        const w = px(it.wCm);
        const ratio = (it.img.naturalHeight || it.img.height) / (it.img.naturalWidth || it.img.width);
        const h = Math.round(w * ratio);
        return { it, w, h };
      });
      const { placements: placed, totalH } = packShelfBFDH(dims, sheetPx, gapPx);
      const c = canvasRef.current || document.createElement('canvas');
      c.width = sheetPx; c.height = totalH;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of placed) ctx.drawImage(p.it.img, p.x, p.y, p.w, p.h);
      const dataUrl = c.toDataURL('image/png');
      const result = { widthCm: sheetW, heightCm: +(totalH / DPI * 2.54).toFixed(1), count: items.length };
      setOut({ dataUrl, ...result });
      let resultBlob = null;
      try { resultBlob = dataUrlToBlob(dataUrl); } catch { /* ignore */ }
      await recordJob({ tool: 'gang-sheet', title: `Gang sheet ${items.length} diseños`, status: 'done',
        inputPreview: makeThumb(items[0].img), outputPreview: '', params: { sheetW, gap }, result,
        resultBlob, resultFilename: 'gang-sheet.png' });
      await logUsage('gang-sheet', 'run', { count: items.length });
      loadJobs();
    } catch (e) { setErr(String(e.message || e)); await logError('gang-sheet', e); }
    finally { setBusy(false); }
  };

  const sidebar = (
    <div className="space-y-6">
      <label className="block">
        <span className={labelCls}>Ancho imprimible: {sheetW} cm</span>
        <input type="range" min="20" max="120" value={sheetW} onChange={(e) => setSheetW(+e.target.value)} className={rangeCls} />
      </label>
      <label className="block">
        <span className={labelCls}>Separación (cm)</span>
        <input type="number" step="0.1" value={gap} onChange={(e) => setGap(+e.target.value)} className={inputCls} />
      </label>
      <button disabled={!items.length || busy || (limit && !limit.allowed)} onClick={build} className="nx-btn-primary w-full py-3 disabled:opacity-40">{busy ? 'Acomodando…' : 'Generar Gang Sheet'}</button>
      {out && <button onClick={() => downloadDataURL(out.dataUrl, 'gang-sheet.png')} className="nx-btn-ghost w-full py-3 inline-flex items-center justify-center gap-2"><Download size={16}/>Descargar PNG</button>}
      {out && <div className="text-xs text-white/50 text-center">{out.widthCm} × {out.heightCm} cm · {out.count} diseños</div>}
      {limit && limit.remaining >= 0 && (
        <div className="text-[11px] text-white/40 mt-3 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
      )}
      {jobs.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 flex items-center gap-2"><History size={13}/>Historial</div>
          <div className="mt-3 space-y-1 text-xs text-white/60">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{j.title}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-white/35">{new Date(j.created).toLocaleDateString('es-MX')}</span>
                  {j.result_file && (
                    <button onClick={async () => { const url = await getJobResultUrl(j); if (url) window.open(url, '_blank'); }} title="Descargar" className="p-1 rounded text-white/40 hover:text-[#00F0FF] hover:bg-white/5">
                      <Download size={12}/>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolShell eyebrow="NEONEXA TOOLS" title="Gang Sheet Pro" subtitle="Acomodo optimizado de diseños para aprovechar al máximo el ancho y largo imprimible." sidebar={sidebar}>
      <div className="space-y-5">
        <Dropzone multiple onFiles={onFiles} hint="Agrega varios PNG transparentes. Ajusta el ancho de cada uno en cm." />
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((it, i) => (
              <div key={i} className="nx-card p-2 relative">
                <button onClick={() => remove(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white/70 hover:text-[#FF2D95]"><X size={14}/></button>
                <div className="aspect-square nx-checker rounded flex items-center justify-center overflow-hidden"><img src={it.url} alt={it.name} className="max-w-full max-h-full object-contain"/></div>
                <div className="text-[11px] truncate mt-2 text-white/60">{it.name}</div>
                <label className="block mt-1">
                  <span className="text-[10px] text-white/40">Ancho: {it.wCm} cm</span>
                  <input type="range" min="3" max={sheetW} value={it.wCm} onChange={(e) => setW(i, +e.target.value)} className={rangeCls} />
                </label>
              </div>
            ))}
          </div>
        )}
        {busy && <div className="flex items-center gap-2 text-white/60"><Loader2 className="animate-spin text-[#00AEEF]" size={20}/>Acomodando diseños…</div>}
        {out && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Vista previa del pliego</div>
            <div className="nx-checker rounded-lg overflow-auto max-h-[500px] p-2"><img src={out.dataUrl} alt="gang sheet" className="w-full"/></div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </ToolShell>
  );
}
