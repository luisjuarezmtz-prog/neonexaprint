import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import { process as processHalftone } from '@/lib/halftoneEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, RefreshCw, Check } from 'lucide-react';

const GARMENTS = [
  { hex: '#ffffff', label: 'Blanca' },
  { hex: '#111318', label: 'Negra' },
  { hex: '#d62432', label: 'Roja' },
  { hex: '#1d4fa3', label: 'Azul' },
  { hex: '#15805d', label: 'Verde' },
];
const PATTERNS = [
  { id: 'circle', label: 'Círculo', glyph: '●' },
  { id: 'square', label: 'Cuadrado', glyph: '■' },
  { id: 'diamond', label: 'Diamante', glyph: '◆' },
  { id: 'hexagon', label: 'Hexágono', glyph: '⬢' },
  { id: 'line', label: 'Línea', glyph: '━' },
];

function garmentInfo(hex) {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max ? (max - min) / max : 0;
  const light = r * 0.299 + g * 0.587 + b * 0.114;
  const name = sat > 0.18 && max / 255 > 0.28 ? 'de color' : light > 145 ? 'blanca' : 'negra';
  return { name };
}

export default function HalftoneSmartTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [garmentColor, setGarmentColor] = useState('#ffffff');
  const [pattern, setPattern] = useState('circle');
  const [size, setSize] = useState(4);
  const [gap, setGap] = useState(9);
  const [angle, setAngle] = useState(0);
  const [contrast, setContrast] = useState(15);
  const [brightness, setBrightness] = useState(0);
  const [highlightProtection, setHighlightProtection] = useState(0);
  const [shadowProtection, setShadowProtection] = useState(0);
  const [tolerance, setTolerance] = useState(28);
  const [dpi, setDpi] = useState(300);
  const [lpi, setLpi] = useState(45);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [fileName, setFileName] = useState('');
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('result'); // 'result' | 'original'
  const [result, setResult] = useState(null); // { canvas, removed, remaining, width, height }
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const loadJobs = () => pb.collection('tool_jobs').getList(1, 6, { filter: pb.filter('tool = {:t}', { t: 'halftone-smart' }), sort: '-created' }).then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit('halftone-smart', planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

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
    draw(showResult && result ? result.canvas : imgRef.current);
  };

  const onFile = async (file) => {
    setErr('');
    try {
      const { img } = await loadImageFromFile(file);
      imgRef.current = img;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setMeta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, name: file.name });
      setResult(null);
      setView('original');
      setReady(true);
    } catch (e) { setErr(String(e.message || e)); }
  };

  // The visible <canvas> only mounts once ready=true; drawing must wait for
  // that commit (effects run after mount) instead of firing right after
  // setReady(true), or the very first draw silently targets a null ref.
  useEffect(() => { if (ready && imgRef.current) draw(imgRef.current); /* eslint-disable-next-line */ }, [ready]);

  const generar = async () => {
    if (!imgRef.current) return;
    const chk = await checkLimit('halftone-smart', planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setBusy(true);
    try {
      const settings = { garmentColor, pattern, size, gap, angle, contrast, brightness, highlightProtection, shadowProtection, tolerance, dpi, lpi };
      const r = await processHalftone(imgRef.current, settings);
      setResult(r);
      setView('result');
      draw(r.canvas);
      r.canvas.toBlob(async (blob) => {
        await recordJob({
          tool: 'halftone-smart', title: `Semitono ${fileName || 'diseño'}`, status: 'done',
          inputPreview: makeThumb(imgRef.current), outputPreview: '',
          params: settings, result: { width: r.width, height: r.height, removed: r.removed, remaining: r.remaining },
          resultBlob: blob, resultFilename: `${fileName || 'imagen'}_Semitono_Neonexa.png`,
        });
        await logUsage('halftone-smart', 'run', { pattern, garmentColor });
        loadJobs();
      }, 'image/png');
    } catch (e) { setErr(String(e.message || e)); await logError('halftone-smart', e); }
    finally { setBusy(false); }
  };

  const download = () => {
    if (!result) return;
    result.canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, `${fileName || 'imagen'}_Semitono_Neonexa_${result.width}x${result.height}px_${dpi}dpi.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const reset = () => {
    setResult(null);
    setView('original');
    draw(imgRef.current);
  };

  const cambiarImagen = () => {
    imgRef.current = null;
    setReady(false); setFileName(''); setMeta(null); setResult(null); setErr(''); setView('result');
  };

  const info = garmentInfo(garmentColor);

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">1. ¿De qué color es la playera?</div>
        <p className="text-white/40 text-[11px] mb-3">Neonexa quitará únicamente este color y protegerá los demás. En colores (roja/azul/verde) solo se quita el color; el patrón de puntos se genera en playeras blancas, negras o grises.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {GARMENTS.map((g) => (
            <button key={g.hex} type="button" title={g.label} onClick={() => setGarmentColor(g.hex)}
              className={`w-8 h-8 rounded-full border-2 ${garmentColor === g.hex ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: g.hex }} />
          ))}
          <input type="color" value={garmentColor} onChange={(e) => setGarmentColor(e.target.value)} className="w-8 h-8 rounded-full border-2 border-white/20 bg-transparent p-0" />
        </div>
        <div className="nx-card p-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full border-2 border-white/20 shrink-0" style={{ background: garmentColor }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-display uppercase tracking-wide">Playera {info.name}</div>
            <div className="text-[11px] text-white/40 mt-0.5">Se quitará {garmentColor.toUpperCase()} y se conservarán los demás colores.</div>
          </div>
          <Check size={16} className="text-[#3ddc84] shrink-0" />
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">2. Patrón del semitono</div>
        <div className="grid grid-cols-5 gap-1.5">
          {PATTERNS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPattern(p.id)}
              className={`flex flex-col items-center justify-center gap-1 h-14 rounded border text-lg ${pattern === p.id ? 'border-[#00F0FF] bg-[#00AEEF]/15 text-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
              <span>{p.glyph}</span>
              <span className="text-[9px] leading-none">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[#00F0FF] text-xs uppercase tracking-widest font-display">
          {showAdvanced ? '− Ocultar ajustes profesionales' : '+ Ajustes profesionales (opcional)'}
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className={labelCls}>Tamaño máximo del punto: {size} px</span>
              <input type="range" min="2" max="18" value={size} onChange={(e) => setSize(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Separación: {gap}</span>
              <input type="range" min="0" max="20" value={gap} onChange={(e) => setGap(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Ángulo de trama: {angle}°</span>
              <input type="range" min="0" max="90" value={angle} onChange={(e) => setAngle(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Contraste: {contrast}</span>
              <input type="range" min="-50" max="80" value={contrast} onChange={(e) => setContrast(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Brillo: {brightness}</span>
              <input type="range" min="-50" max="50" value={brightness} onChange={(e) => setBrightness(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block">
              <span className={labelCls}>Protección de luces: {highlightProtection}%</span>
              <input type="range" min="0" max="100" value={highlightProtection} onChange={(e) => setHighlightProtection(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Recupera puntos y detalle en las áreas claras.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Protección de sombras: {shadowProtection}%</span>
              <input type="range" min="0" max="100" value={shadowProtection} onChange={(e) => setShadowProtection(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Evita que las áreas oscuras se cierren y pierdan textura.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Tolerancia del color: {tolerance}</span>
              <input type="range" min="4" max="80" value={tolerance} onChange={(e) => setTolerance(+e.target.value)} className={rangeCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelCls}>DPI</span>
                <input type="number" min="150" max="1200" value={dpi} onChange={(e) => setDpi(+e.target.value || 150)} className={inputCls} />
              </label>
              <label className="block">
                <span className={labelCls}>LPI</span>
                <input type="number" min="15" max="60" value={lpi} onChange={(e) => setLpi(+e.target.value || 15)} className={inputCls} />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-1.5 text-[11px] text-[#3ddc84]">
          <div>✓ Otros colores protegidos</div>
          <div>✓ Bordes descontaminados</div>
          <div>✓ Un PNG transparente</div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || busy || (limit && !limit.allowed)} onClick={generar} className="nx-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Preparando imagen…' : 'Preparar imagen'}
        </button>
        <button disabled={!result} onClick={download} className="nx-btn-primary w-full py-3 disabled:opacity-40" style={{ background: '#15805d' }}>Aprobar y descargar PNG</button>
        <button disabled={!result} onClick={reset} className="nx-btn-ghost w-full py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-40"><RefreshCw size={14}/>Restaurar original</button>
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
    <ToolShell eyebrow="NEONEXA TOOLS" title="Neonexa Halftone" subtitle="Elige el color de playera, Neonexa quita solo ese color, protege el resto y genera el semitono listo para DTF." sidebar={sidebar}>
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
              <div className="nx-card p-3 flex items-center justify-center gap-6 text-xs text-[#3ddc84] shrink-0">
                <span><b>{result.removed}%</b> área liberada</span>
                <span><b>{result.remaining}%</b> imagen conservada</span>
                <span>PNG con transparencia real</span>
              </div>
            )}
          </>
        )}
      </div>
    </ToolShell>
  );
}
