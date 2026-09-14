import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import { process as vectorize, buildSvg } from '@/lib/vectorEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, RotateCcw, X } from 'lucide-react';

const SLUG = 'vectorizer';

const MODES = [
  { id: 'bw', label: 'Blanco y negro', glyph: '◐', help: 'Ideal para logos, sellos, texto y líneas. Traza el contorno de la tinta sobre un umbral.' },
  { id: 'color', label: 'A color', glyph: '◑', help: 'Ideal para ilustraciones y diseños con varios colores planos. Cuantiza la imagen y traza cada color por separado.' },
];

const QUICK_COLORS = [
  '#000000', '#ffffff', '#8e8e93', '#c8c8c8', '#4a2a1a', '#ff3b30', '#ff9500', '#ffcc00',
  '#34c759', '#00c7be', '#30b0c7', '#32ade6', '#007aff', '#5856d6', '#af52de', '#ff2d55',
];

// ---- conversiones de color del editor de paleta (portadas del módulo original) ----
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Selector matiz/saturación/brillo del editor de color. */
function ColorPicker({ original, onCancel, onApply, recents }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(...hexToRgb(original)));
  const svRef = useRef(null);
  const hueRef = useRef(null);
  const dragRef = useRef(null);

  const [h, s, v] = hsv;
  const hex = rgbToHex(...hsvToRgb(h, s, v));

  // Los canvas del modal se montan con él; pintarlos tiene que esperar al
  // commit (los efectos corren después del montaje), no al click que abre.
  useEffect(() => {
    const sv = svRef.current, hue = hueRef.current;
    if (!sv || !hue) return;
    const sx = sv.getContext('2d'), w = sv.width, ht = sv.height;
    const [r0, g0, b0] = hsvToRgb(h, 1, 1);
    sx.fillStyle = `rgb(${r0 | 0},${g0 | 0},${b0 | 0})`;
    sx.fillRect(0, 0, w, ht);
    const sat = sx.createLinearGradient(0, 0, w, 0);
    sat.addColorStop(0, 'rgba(255,255,255,1)'); sat.addColorStop(1, 'rgba(255,255,255,0)');
    sx.fillStyle = sat; sx.fillRect(0, 0, w, ht);
    const val = sx.createLinearGradient(0, 0, 0, ht);
    val.addColorStop(0, 'rgba(0,0,0,0)'); val.addColorStop(1, 'rgba(0,0,0,1)');
    sx.fillStyle = val; sx.fillRect(0, 0, w, ht);
    const hx = s * w, hy = (1 - v) * ht;
    sx.beginPath(); sx.arc(hx, hy, 6, 0, Math.PI * 2); sx.strokeStyle = '#fff'; sx.lineWidth = 2; sx.stroke();
    sx.beginPath(); sx.arc(hx, hy, 6, 0, Math.PI * 2); sx.strokeStyle = '#00000088'; sx.lineWidth = 1; sx.stroke();

    const hc = hue.getContext('2d'), hw = hue.width, hh = hue.height;
    const grad = hc.createLinearGradient(0, 0, hw, 0);
    for (let i = 0; i <= 360; i += 30) grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
    hc.fillStyle = grad; hc.fillRect(0, 0, hw, hh);
    const px = (h / 360) * hw;
    hc.fillStyle = '#fff'; hc.fillRect(Math.max(0, px - 2), 0, 4, hh);
    hc.strokeStyle = '#00000088'; hc.strokeRect(Math.max(0, px - 2) + 0.5, 0.5, 3, hh - 1);
  }, [h, s, v]);

  const fromSv = (e) => {
    const rect = svRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setHsv(([hh]) => [hh, rect.width ? x / rect.width : 0, rect.height ? 1 - y / rect.height : 0]);
  };
  const fromHue = (e) => {
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHsv(([, ss, vv]) => [rect.width ? (x / rect.width) * 360 : 0, ss, vv]);
  };
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* puntero sintético: ignorar */ } };

  const [r, g, b] = hsvToRgb(h, s, v).map(Math.round);
  const setRgb = (nr, ng, nb) => setHsv(rgbToHsv(nr, ng, nb));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="nx-card p-5 w-full max-w-[320px] space-y-3" role="dialog" aria-label="Editar color">
        <div className="flex items-center justify-between">
          <strong className="font-display uppercase tracking-widest text-sm">Editar color</strong>
          <button onClick={onCancel} className="text-white/50 hover:text-white p-1" aria-label="Cerrar"><X size={16}/></button>
        </div>

        <canvas ref={svRef} width="264" height="150" className="w-full rounded cursor-crosshair touch-none"
          onPointerDown={(e) => { dragRef.current = 'sv'; fromSv(e); capture(e.currentTarget, e.pointerId); }}
          onPointerMove={(e) => { if (dragRef.current === 'sv') fromSv(e); }}
          onPointerUp={() => { dragRef.current = null; }} />
        <canvas ref={hueRef} width="264" height="14" className="w-full rounded cursor-crosshair touch-none"
          onPointerDown={(e) => { dragRef.current = 'hue'; fromHue(e); capture(e.currentTarget, e.pointerId); }}
          onPointerMove={(e) => { if (dragRef.current === 'hue') fromHue(e); }}
          onPointerUp={() => { dragRef.current = null; }} />

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded border border-white/20 shrink-0" style={{ background: original }} />
            <span className="text-white/50">Original<br/><b className="text-white/80">{original.toUpperCase()}</b></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded border border-white/20 shrink-0" style={{ background: hex }} />
            <span className="text-white/50">Nuevo<br/><b className="text-white/80">{hex.toUpperCase()}</b></span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <label className="col-span-1"><span className={labelCls}>Hex</span>
            <input type="text" maxLength={7} value={hex} className={inputCls}
              onChange={(e) => { const t = e.target.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(t)) setHsv(rgbToHsv(...hexToRgb(t.startsWith('#') ? t : '#' + t))); }} /></label>
          <label><span className={labelCls}>R</span><input type="number" min="0" max="255" value={r} onChange={(e) => setRgb(+e.target.value, g, b)} className={inputCls}/></label>
          <label><span className={labelCls}>G</span><input type="number" min="0" max="255" value={g} onChange={(e) => setRgb(r, +e.target.value, b)} className={inputCls}/></label>
          <label><span className={labelCls}>B</span><input type="number" min="0" max="255" value={b} onChange={(e) => setRgb(r, g, +e.target.value)} className={inputCls}/></label>
        </div>

        <div>
          <span className={labelCls}>Colores rápidos</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COLORS.map((c) => (
              <button key={c} title={c} onClick={() => setHsv(rgbToHsv(...hexToRgb(c)))}
                className="w-6 h-6 rounded border border-white/20" style={{ background: c }} />
            ))}
          </div>
        </div>
        {recents.length > 0 && (
          <div>
            <span className={labelCls}>Recientes</span>
            <div className="flex flex-wrap gap-1.5">
              {recents.map((c) => (
                <button key={c} title={c} onClick={() => setHsv(rgbToHsv(...hexToRgb(c)))}
                  className="w-6 h-6 rounded border border-white/20" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="nx-btn-ghost flex-1 py-2.5">Cancelar</button>
          <button onClick={() => onApply(hex)} className="nx-btn-primary flex-1 py-2.5">Aplicar color</button>
        </div>
      </div>
    </div>
  );
}

export default function VectorizerTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [mode, setMode] = useState('bw');
  const [autoThreshold, setAutoThreshold] = useState(true);
  const [threshold, setThreshold] = useState(128);
  const [invert, setInvert] = useState(false);
  const [colors, setColors] = useState(16);
  const [denoise, setDenoise] = useState(1);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [sharpen, setSharpen] = useState(50);
  const [despeckle, setDespeckle] = useState(35);
  const [simplify, setSimplify] = useState(65);
  const [smoothing, setSmoothing] = useState(75);
  const [workSize, setWorkSize] = useState(1200);
  const [showAdvanced, setShowAdvanced] = useState(true);

  const [fileName, setFileName] = useState('');
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('result');
  const [result, setResult] = useState(null); // { width, height, pathCount, sizeKb }
  const [layers, setLayers] = useState([]);
  const [layersOriginal, setLayersOriginal] = useState([]);
  const [editing, setEditing] = useState(-1);
  const [recents, setRecents] = useState([]);
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const resultImgRef = useRef(null);
  const svgRef = useRef('');
  const svgUrlRef = useRef('');

  const loadJobs = () => pb.collection('tool_jobs')
    .getList(1, 6, { filter: pb.filter('tool = {:t}', { t: SLUG }), sort: '-created' })
    .then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit(SLUG, planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);
  useEffect(() => () => { if (svgUrlRef.current) URL.revokeObjectURL(svgUrlRef.current); }, []);

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
    draw(showResult && resultImgRef.current ? resultImgRef.current : imgRef.current);
  };

  const clearResult = () => {
    if (svgUrlRef.current) { URL.revokeObjectURL(svgUrlRef.current); svgUrlRef.current = ''; }
    svgRef.current = ''; resultImgRef.current = null;
    setResult(null); setLayers([]); setLayersOriginal([]); setView('original');
    draw(imgRef.current);
  };

  const onFile = async (file) => {
    setErr('');
    try {
      const { img } = await loadImageFromFile(file);
      imgRef.current = img;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setMeta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, name: file.name });
      if (svgUrlRef.current) { URL.revokeObjectURL(svgUrlRef.current); svgUrlRef.current = ''; }
      svgRef.current = ''; resultImgRef.current = null;
      setResult(null); setLayers([]); setLayersOriginal([]); setView('original');
      setReady(true);
    } catch (e) { setErr(String(e.message || e)); }
  };

  // El <canvas> solo se monta cuando ready=true; el primer dibujo tiene que
  // esperar a ese commit en vez de dispararse junto al setReady(true), o
  // apuntaría a una ref todavía nula y la imagen no aparecería al cargarla.
  useEffect(() => { if (ready && imgRef.current) draw(imgRef.current); /* eslint-disable-next-line */ }, [ready]);

  const svgToImage = async (svg) => {
    if (svgUrlRef.current) URL.revokeObjectURL(svgUrlRef.current);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    svgUrlRef.current = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = svgUrlRef.current; });
    resultImgRef.current = img;
    return blob;
  };

  const generar = async () => {
    if (!imgRef.current) return;
    const chk = await checkLimit(SLUG, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setBusy(true);
    try {
      const settings = {
        mode,
        threshold: autoThreshold ? null : threshold,
        invert,
        colors,
        denoise,
        sharpen: sharpen / 100,
        smoothing: smoothing / 100,
        simplify: simplify / 100,
        despeckle: despeckle / 100,
        maxWorkingSize: workSize,
        removeBackground,
      };
      const r = await vectorize(imgRef.current, settings);
      svgRef.current = r.svg;
      const blob = await svgToImage(r.svg);
      const next = r.layers.map((l) => ({ fill: l.fill, d: l.d, hidden: false }));
      setLayers(next);
      setLayersOriginal(next.map((l) => ({ ...l })));
      setResult({ width: r.width, height: r.height, pathCount: r.pathCount, sizeKb: (blob.size / 1024).toFixed(1) });
      setView('result');
      draw(resultImgRef.current);

      await recordJob({
        tool: SLUG, title: `Vector ${fileName || 'diseño'}`, status: 'done',
        inputName: meta?.name, inputPreview: makeThumb(imgRef.current),
        params: settings, result: { width: r.width, height: r.height, pathCount: r.pathCount, mode: r.mode, threshold: r.threshold },
        resultBlob: blob, resultFilename: `${fileName || 'imagen'}_Vector_Neonexa.svg`,
      });
      await logUsage(SLUG, 'run', { mode, colors });
      loadJobs();
    } catch (e) { setErr(String(e.message || e)); await logError(SLUG, e); }
    finally { setBusy(false); }
  };

  // Recolorear u ocultar una capa recombina el SVG a partir de los trazos ya
  // calculados — nunca vuelve a vectorizar.
  const applyLayers = async (next) => {
    setLayers(next);
    const svg = buildSvg(next, result.width, result.height);
    svgRef.current = svg;
    const blob = await svgToImage(svg);
    setResult((r) => ({ ...r, sizeKb: (blob.size / 1024).toFixed(1) }));
    if (view === 'result') draw(resultImgRef.current);
  };

  const toggleLayer = (i) => applyLayers(layers.map((l, n) => (n === i ? { ...l, hidden: !l.hidden } : l)));
  const applyColor = (hex) => {
    setRecents((prev) => [hex, ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 8));
    applyLayers(layers.map((l, n) => (n === editing ? { ...l, fill: hex } : l)));
    setEditing(-1);
  };
  const resetColors = () => applyLayers(layersOriginal.map((l) => ({ ...l })));
  const paletteTouched = layers.some((l, i) => !layersOriginal[i] || l.fill !== layersOriginal[i].fill || l.hidden);

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(new Blob([svgRef.current], { type: 'image/svg+xml' }));
    downloadDataURL(url, `${fileName || 'imagen'}_Vector_Neonexa.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadPng = () => {
    const img = resultImgRef.current;
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    c.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, `${fileName || 'imagen'}_Vector_Neonexa.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const cambiarImagen = () => {
    if (svgUrlRef.current) { URL.revokeObjectURL(svgUrlRef.current); svgUrlRef.current = ''; }
    imgRef.current = null; resultImgRef.current = null; svgRef.current = '';
    setReady(false); setFileName(''); setMeta(null); setResult(null);
    setLayers([]); setLayersOriginal([]); setErr(''); setView('result');
  };

  const modeInfo = MODES.find((m) => m.id === mode);

  const sidebar = (
    <div className="space-y-6">
      {layers.length > 0 && (
        <div>
          <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-2">Colores detectados</div>
          <p className="text-white/40 text-[11px] mb-3">Haz clic en un color para editarlo. La × oculta esa región.</p>
          <div className="flex flex-wrap gap-2">
            {layers.map((l, i) => (
              <div key={i} className="relative">
                <button onClick={() => setEditing(i)} title={l.fill}
                  className={`w-9 h-9 rounded border-2 border-white/20 hover:border-[#00F0FF] ${l.hidden ? 'opacity-25' : ''}`}
                  style={{ background: l.fill }} />
                <button onClick={() => toggleLayer(i)} title={l.hidden ? 'Mostrar color' : 'Ocultar color'}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/80 border border-white/30 text-white/70 text-[9px] leading-none hover:text-white">×</button>
              </div>
            ))}
          </div>
          <button onClick={resetColors} disabled={!paletteTouched}
            className="nx-btn-ghost w-full py-2 mt-3 text-xs disabled:opacity-30">Restablecer colores</button>
        </div>
      )}

      <div className={layers.length > 0 ? 'pt-4 border-t border-white/10' : ''}>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">1. Modo de vectorización</div>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button key={m.id} onClick={() => { setMode(m.id); clearResult(); }}
              className={`flex flex-col items-center justify-center gap-1 h-16 rounded border text-xl ${mode === m.id ? 'border-[#00F0FF] bg-[#00AEEF]/15 text-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
              <span>{m.glyph}</span><span className="text-[10px] leading-none">{m.label}</span>
            </button>
          ))}
        </div>
        <p className="text-white/40 text-[11px] mt-2">{modeInfo.help}</p>
      </div>

      {mode === 'bw' ? (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="font-display uppercase tracking-widest text-xs text-white/60">2. Umbral (blanco/negro)</div>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={autoThreshold} onChange={(e) => setAutoThreshold(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
            Automático (método de Otsu)
          </label>
          <label className="block">
            <span className={labelCls}>Umbral manual: {threshold}</span>
            <input type="range" min="1" max="254" value={threshold} disabled={autoThreshold}
              onChange={(e) => setThreshold(+e.target.value)} className={`${rangeCls} disabled:opacity-30`} />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
            Invertir (arte claro sobre fondo oscuro)
          </label>
        </div>
      ) : (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="font-display uppercase tracking-widest text-xs text-white/60">2. Colores del vector</div>
          <label className="block">
            <span className={labelCls}>Número de colores: {colors}</span>
            <input type="range" min="2" max="64" value={colors} onChange={(e) => setColors(+e.target.value)} className={rangeCls} />
            <span className="text-[11px] text-white/40 mt-1 block">Cuantización perceptual (espacio Lab), no RGB directo: evita fusionar colores que a simple vista se ven distintos.</span>
          </label>
          <label className="block">
            <span className={labelCls}>Difuminado previo: {denoise}</span>
            <input type="range" min="0" max="4" value={denoise} onChange={(e) => setDenoise(+e.target.value)} className={rangeCls} />
            <span className="text-[11px] text-white/40 mt-1 block">Suaviza el ruido ANTES de calcular los colores (fotos con grano o JPEG se benefician de 1-2).</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
            Quitar automáticamente el color de fondo
          </label>
        </div>
      )}

      <div className="pt-4 border-t border-white/10">
        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[#00F0FF] text-xs uppercase tracking-widest font-display">
          {showAdvanced ? '− Ocultar ajustes de trazo' : '+ Ajustes de trazo (opcional)'}
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className={labelCls}>Nitidez: {sharpen}%</span>
              <input type="range" min="0" max="100" value={sharpen} onChange={(e) => setSharpen(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Realza el contraste en los bordes antes de calcular umbral/colores. Súbelo si se ven “lavados”.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Eliminar ruido: {despeckle}%</span>
              <input type="range" min="0" max="100" value={despeckle} onChange={(e) => setDespeckle(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Fusiona motas diminutas con la región vecina dominante, en vez de solo borrarlas.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Simplificación de curvas: {simplify}%</span>
              <input type="range" min="0" max="100" value={simplify} onChange={(e) => setSimplify(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Más alto = curvas limpias y archivo ligero; demasiado alto deforma detalles finos.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Suavizado de curvas: {smoothing}%</span>
              <input type="range" min="0" max="100" value={smoothing} onChange={(e) => setSmoothing(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">0% conserva esquinas rectas; 100% da curvas orgánicas. Las esquinas duras se mantienen rectas siempre.</span>
            </label>
            <label className="block">
              <span className={labelCls}>Resolución de trabajo: {workSize} px</span>
              <input type="range" min="400" max="3000" step="100" value={workSize} onChange={(e) => setWorkSize(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Mayor resolución = más fidelidad y más tiempo. El SVG final siempre es nítido a cualquier tamaño.</span>
            </label>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-1.5 text-[11px] text-[#3ddc84]">
          <div>✓ Salida SVG escalable</div>
          <div>✓ Colores editables por capa</div>
          <div>✓ Sin pérdida de calidad</div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || busy || (limit && !limit.allowed)} onClick={generar} className="nx-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Vectorizando…' : 'Vectorizar imagen'}
        </button>
        <button disabled={!result} onClick={downloadSvg} className="nx-btn-primary w-full py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2" style={{ background: '#15805d' }}>
          <Download size={16}/>Descargar SVG
        </button>
        <button disabled={!result} onClick={downloadPng} className="nx-btn-ghost w-full py-2.5 disabled:opacity-40">Descargar PNG (vista previa)</button>
        <button disabled={!result} onClick={clearResult} className="nx-btn-ghost w-full py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-40"><RotateCcw size={14}/>Restaurar original</button>
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
      title="Neonexa Vectorizar"
      subtitle="Convierte tu imagen en un SVG vectorial real, editable y escalable sin pérdida — trazado matemático en tu navegador, sin enviar el archivo a ningún servidor."
      sidebar={sidebar}
    >
      <div className="flex flex-col gap-5 h-full">
        {!ready && <Dropzone onFile={onFile} hint="PNG, JPG o WEBP. El archivo original siempre se conserva." />}
        {ready && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex gap-2">
                <button onClick={() => selectView(true)} disabled={!result}
                  className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest disabled:opacity-30 ${view === 'result' ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>Vector</button>
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
                <span><b>{result.pathCount}</b> trazos vectoriales</span>
                <span><b>{result.sizeKb} KB</b> peso del SVG</span>
                <span>Escalable sin pérdida de calidad</span>
              </div>
            )}
          </>
        )}
      </div>

      {editing >= 0 && layers[editing] && (
        <ColorPicker original={layers[editing].fill} recents={recents}
          onCancel={() => setEditing(-1)} onApply={applyColor} />
      )}
    </ToolShell>
  );
}
