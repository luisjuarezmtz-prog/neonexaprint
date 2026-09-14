import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import { detectBackgroundColor, removeOuterBackground, trimCanvas } from '@/lib/backgroundEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, RotateCcw, Check } from 'lucide-react';

const SLUG = 'background-remover';

export default function BackgroundRemoverTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(28);
  const [decontaminate, setDecontaminate] = useState(70);
  const [trim, setTrim] = useState(true);

  const [fileName, setFileName] = useState('');
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('result');
  const [result, setResult] = useState(null); // { removed, remaining, w, h }
  const [autoDetected, setAutoDetected] = useState(false);
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const outRef = useRef(null); // canvas con el resultado

  const loadJobs = () => pb.collection('tool_jobs')
    .getList(1, 6, { filter: pb.filter('tool = {:t}', { t: SLUG }), sort: '-created' })
    .then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit(SLUG, planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const draw = (source) => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const w = source instanceof HTMLCanvasElement ? source.width : (source.naturalWidth || source.width);
    const h = source instanceof HTMLCanvasElement ? source.height : (source.naturalHeight || source.height);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
  };

  const selectView = (showResult) => {
    setView(showResult ? 'result' : 'original');
    draw(showResult && outRef.current ? outRef.current : imgRef.current);
  };

  const onFile = async (file) => {
    setErr('');
    try {
      const { img } = await loadImageFromFile(file);
      imgRef.current = img;
      outRef.current = null;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setMeta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, name: file.name });
      setResult(null);
      setView('original');
      setReady(true);
      // El color de las esquinas es solo la semilla: si la imagen tiene una
      // esquina atípica, el usuario la corrige con el selector.
      try { setBackgroundColor(detectBackgroundColor(img)); setAutoDetected(true); }
      catch { setAutoDetected(false); }
    } catch (e) { setErr(String(e.message || e)); }
  };

  // El <canvas> solo existe cuando ready=true; el primer dibujo espera al
  // commit en un efecto, no al mismo tick del setReady(true).
  useEffect(() => { if (ready && imgRef.current) draw(imgRef.current); /* eslint-disable-next-line */ }, [ready]);

  const generar = async () => {
    if (!imgRef.current) return;
    const chk = await checkLimit(SLUG, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setBusy(true);
    try {
      const params = { backgroundColor, tolerance, decontaminate, trim };
      const r = removeOuterBackground(imgRef.current, params);
      const finalCanvas = trim ? trimCanvas(r.canvas) : r.canvas;
      outRef.current = finalCanvas;
      setResult({ removed: r.removed, remaining: r.remaining, w: finalCanvas.width, h: finalCanvas.height });
      setView('result');
      draw(finalCanvas);

      finalCanvas.toBlob(async (blob) => {
        await recordJob({
          tool: SLUG, title: `Sin fondo ${fileName || 'diseño'}`, status: 'done',
          inputName: meta?.name, inputPreview: makeThumb(imgRef.current),
          params, result: { removed: r.removed, remaining: r.remaining, width: finalCanvas.width, height: finalCanvas.height },
          resultBlob: blob, resultFilename: `${fileName || 'imagen'}_sin_fondo.png`,
        });
        await logUsage(SLUG, 'run', { tolerance, trim });
        loadJobs();
      }, 'image/png');
    } catch (e) { setErr(String(e.message || e)); await logError(SLUG, e); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!outRef.current) return;
    outRef.current.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, `${fileName || 'imagen'}_sin_fondo.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const reset = () => { outRef.current = null; setResult(null); setView('original'); draw(imgRef.current); };
  const cambiarImagen = () => {
    imgRef.current = null; outRef.current = null;
    setReady(false); setFileName(''); setMeta(null); setResult(null); setErr(''); setView('result'); setAutoDetected(false);
  };

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">1. Color del fondo exterior</div>
        <p className="text-white/40 text-[11px] mb-3">Se toma de las esquinas al cargar la imagen. Corrígelo si la esquina no era representativa del fondo.</p>
        <div className="nx-card p-3 flex items-center gap-3">
          <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)}
            className="w-9 h-9 rounded border-2 border-white/20 bg-transparent p-0 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-display uppercase tracking-wide">{backgroundColor.toUpperCase()}</div>
            <div className="text-[11px] text-white/40 mt-0.5">{autoDetected ? 'Detectado automáticamente' : 'Elige el color a eliminar'}</div>
          </div>
          {autoDetected && <Check size={16} className="text-[#3ddc84] shrink-0" />}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-4">
        <div className="font-display uppercase tracking-widest text-xs text-white/60">2. Ajustes</div>
        <label className="block">
          <span className={labelCls}>Tolerancia: {tolerance}</span>
          <input type="range" min="3" max="100" value={tolerance} onChange={(e) => setTolerance(+e.target.value)} className={rangeCls} />
          <span className="text-[11px] text-white/40 mt-1 block">Súbela si quedan restos de fondo; bájala si empieza a comerse el diseño.</span>
        </label>
        <label className="block">
          <span className={labelCls}>Descontaminar borde: {decontaminate}%</span>
          <input type="range" min="0" max="100" value={decontaminate} onChange={(e) => setDecontaminate(+e.target.value)} className={rangeCls} />
          <span className="text-[11px] text-white/40 mt-1 block">Quita el tinte del fondo que queda mezclado en el contorno, en vez de dejar un orillo teñido.</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
          Ajustar el lienzo al diseño
        </label>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-1.5 text-[11px] text-[#3ddc84]">
          <div>✓ Solo se quita el fondo que toca las orillas</div>
          <div>✓ Negros, blancos y huecos internos protegidos</div>
          <div>✓ PNG con transparencia real</div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || busy || (limit && !limit.allowed)} onClick={generar} className="nx-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Quitando fondo…' : 'Eliminar fondo exterior'}
        </button>
        <button disabled={!result} onClick={download} className="nx-btn-primary w-full py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2" style={{ background: '#15805d' }}>
          <Download size={16}/>Descargar PNG transparente
        </button>
        <button disabled={!result} onClick={reset} className="nx-btn-ghost w-full py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-40"><RotateCcw size={14}/>Restaurar original</button>
        {ready && <button onClick={cambiarImagen} className="text-white/40 text-xs w-full text-center hover:text-white/70">Cambiar imagen</button>}
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        {limit && limit.remaining >= 0 && (
          <div className="text-[11px] text-white/40 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
        )}
        <p className="text-white/35 text-[10px] text-center">🔒 El archivo original siempre se conserva</p>
      </div>

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
    <ToolShell
      eyebrow="NEONEXA TOOLS"
      title="Neonexa Quitar Fondo"
      subtitle="Elimina únicamente el fondo que toca las orillas y descontamina el contorno. Los negros, blancos y huecos que están dentro del diseño quedan protegidos."
      sidebar={sidebar}
    >
      <div className="flex flex-col gap-5 h-full">
        {!ready && <Dropzone onFile={onFile} hint="PNG, JPG o WEBP. El archivo original siempre se conserva." />}
        {ready && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex gap-2">
                <button onClick={() => selectView(true)} disabled={!result}
                  className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest disabled:opacity-30 ${view === 'result' ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>Resultado</button>
                <button onClick={() => selectView(false)}
                  className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest ${view === 'original' ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>Original</button>
              </div>
              <div className="text-xs text-white/50 truncate">{meta?.name}{meta ? ` · ${meta.w} × ${meta.h}px` : ''}</div>
            </div>

            <div className="nx-checker rounded-lg overflow-auto flex-1 min-h-[400px] p-2 flex items-center justify-center relative">
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><Loader2 className="animate-spin text-[#00AEEF]" size={28}/></div>}
              <canvas ref={canvasRef} className="max-w-full max-h-full" />
            </div>

            {result && (
              <div className="nx-card p-3 flex flex-wrap items-center justify-center gap-6 text-xs text-[#3ddc84] shrink-0">
                <span><b>{result.removed}%</b> de fondo eliminado</span>
                <span><b>{result.w} × {result.h}px</b> lienzo final</span>
                <span>PNG con transparencia real</span>
              </div>
            )}
          </>
        )}
      </div>
    </ToolShell>
  );
}
