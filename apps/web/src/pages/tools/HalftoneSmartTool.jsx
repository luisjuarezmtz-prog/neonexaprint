import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, RefreshCw } from 'lucide-react';

const GARMENTS = ['#111111', '#ffffff', '#c0392b', '#1f4e8c', '#2e7d32', '#f1c40f', '#7f8c8d'];
const CMYK_COLOR = { c: { r: 0, g: 174, b: 239 }, m: { r: 236, g: 0, b: 140 }, y: { r: 255, g: 238, b: 0 }, k: { r: 20, g: 20, b: 20 } };
const CMYK_ANGLE = { c: 15, m: 75, y: 0, k: 45 };
const MAX_DIM = 2600;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function clampVal(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }
function correctedVal(v, contrast, gamma, gain, invert) {
  let x = v / 255;
  x = clampVal((x - 0.5) * contrast + 0.5);
  x = Math.pow(x, gamma);
  x = clampVal(x + gain / 100);
  return invert ? 1 - x : x;
}
function sampleRegion(data, w, h, cx, cy, r, removeLight, threshold) {
  let R = 0, G = 0, B = 0, A = 0, N = 0;
  const st = Math.max(1, Math.floor(r / 2));
  for (let y = Math.max(0, ~~(cy - r)); y < Math.min(h, cy + r); y += st) {
    for (let x = Math.max(0, ~~(cx - r)); x < Math.min(w, cx + r); x += st) {
      const i = (y * w + x) * 4;
      let a = data[i + 3] / 255;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (removeLight && lum >= threshold) a = 0;
      R += data[i] * a; G += data[i + 1] * a; B += data[i + 2] * a; A += a; N++;
    }
  }
  if (!A) return { r: 0, g: 0, b: 0, a: 0, lum: 255 };
  const r0 = R / A, g0 = G / A, b0 = B / A;
  return { r: r0, g: g0, b: b0, a: A / N, lum: 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0 };
}
function markDot(ctx, x, y, size, d, col, alpha, ang, shape) {
  if (d <= 0.001 || alpha <= 0.001) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(${col.r | 0},${col.g | 0},${col.b | 0},${alpha})`;
  const s = size * Math.sqrt(clampVal(d));
  ctx.beginPath();
  switch (shape) {
    case 'square': ctx.rect(-s / 2, -s / 2, s, s); break;
    case 'ellipse': ctx.ellipse(0, 0, s / 2, s / 3, 0, 0, Math.PI * 2); break;
    case 'line': ctx.rect(-size / 2, -s / 2, size, s); break;
    case 'diamond': ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s / 2, 0); ctx.closePath(); break;
    default: ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
// Separable max-dilation with a square structuring element (equivalent to the
// naive O(w*h*rad^2) window-max, but O(w*h*rad) — matters at rad up to 12 on 2600px images.
function dilateAlpha(alpha, w, h, rad) {
  if (rad <= 0) return alpha;
  const tmp = new Uint8ClampedArray(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 0;
      const x0 = Math.max(0, x - rad), x1 = Math.min(w - 1, x + rad);
      for (let xx = x0; xx <= x1; xx++) m = Math.max(m, alpha[row + xx]);
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0;
      const y0 = Math.max(0, y - rad), y1 = Math.min(h - 1, y + rad);
      for (let yy = y0; yy <= y1; yy++) m = Math.max(m, tmp[yy * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

const VIEWS = [
  { id: 'preview', label: 'Vista prenda' },
  { id: 'art', label: 'Arte transparente' },
  { id: 'base', label: 'Base blanca' },
  { id: 'original', label: 'Original' },
];

export default function HalftoneSmartTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [dpi, setDpi] = useState(300);
  const [lpi, setLpi] = useState(45);
  const [technique, setTechnique] = useState('dtf');
  const [mode, setMode] = useState('color');
  const [shape, setShape] = useState('round');
  const [angle, setAngle] = useState(22.5);
  const [contrast, setContrast] = useState(1.2);
  const [gamma, setGamma] = useState(1);
  const [gain, setGain] = useState(0);
  const [inkColor, setInkColor] = useState('#ffffff');
  const [invert, setInvert] = useState(false);
  const [garmentColor, setGarmentColor] = useState('#111111');
  const [underbase, setUnderbase] = useState(true);
  const [choke, setChoke] = useState(1);
  const [baseOpacity, setBaseOpacity] = useState(92);
  const [removeLight, setRemoveLight] = useState(false);
  const [threshold, setThreshold] = useState(248);

  const [fileName, setFileName] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('preview');
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const srcRef = useRef(null);
  const artRef = useRef(null);
  const baseRef = useRef(null);
  const cRef = useRef(null), mRef = useRef(null), yRef = useRef(null), kRef = useRef(null);
  const canvasRef = useRef(null);
  const thumbImgRef = useRef(null);
  const channelRefs = { c: cRef, m: mRef, y: yRef, k: kRef };

  const loadJobs = () => pb.collection('tool_jobs').getList(1, 6, { filter: pb.filter('tool = {:t}', { t: 'halftone-smart' }), sort: '-created' }).then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit('halftone-smart', planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const computeHalftone = () => {
    const s = srcRef.current, art = artRef.current, base = baseRef.current;
    const w = s.width, h = s.height;
    if (!w || !h) return;
    const cell = Math.max(2, dpi / lpi);
    const ang = angle * Math.PI / 180;
    [art, base, cRef.current, mRef.current, yRef.current, kRef.current].forEach((c) => { c.width = w; c.height = h; });
    const actx = art.getContext('2d'), bctx = base.getContext('2d');
    actx.clearRect(0, 0, w, h); bctx.clearRect(0, 0, w, h);
    ['c', 'm', 'y', 'k'].forEach((k) => channelRefs[k].current.getContext('2d').clearRect(0, 0, w, h));

    const sctx = s.getContext('2d', { willReadFrequently: true });
    const im = sctx.getImageData(0, 0, w, h), data = im.data;
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) {
      const a = data[i * 4 + 3];
      const lum = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      alpha[i] = (removeLight && lum >= threshold) ? 0 : a;
    }
    const mask = dilateAlpha(alpha, w, h, choke);
    const bid = bctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      bid.data[i * 4] = 255; bid.data[i * 4 + 1] = 255; bid.data[i * 4 + 2] = 255; bid.data[i * 4 + 3] = mask[i];
    }
    bctx.putImageData(bid, 0, 0);

    const diag = Math.hypot(w, h), co = Math.cos(ang), si = Math.sin(ang);
    const ink = hexToRgb(inkColor);
    for (let gy = -diag; gy <= diag; gy += cell) {
      for (let gx = -diag; gx <= diag; gx += cell) {
        const x = w / 2 + gx * co - gy * si, y = h / 2 + gx * si + gy * co;
        if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
        const p = sampleRegion(data, w, h, x, y, cell * 0.48, removeLight, threshold);
        if (!p.a) continue;
        if (mode === 'color') {
          markDot(actx, x, y, cell, Math.max(0.02, p.a), p, p.a, ang, shape);
        } else if (mode === 'mono' || mode === 'grayscale') {
          const d = correctedVal(255 - p.lum, contrast, gamma, gain, invert) * p.a;
          markDot(actx, x, y, cell, d, mode === 'grayscale' ? { r: 30, g: 30, b: 30 } : ink, p.a, ang, shape);
        } else {
          const R = p.r / 255, G = p.g / 255, B = p.b / 255, K = 1 - Math.max(R, G, B), den = 1 - K || 1;
          const vals = { c: clampVal((1 - R - K) / den), m: clampVal((1 - G - K) / den), y: clampVal((1 - B - K) / den), k: clampVal(K) };
          for (const key of ['c', 'm', 'y', 'k']) {
            const d = correctedVal(vals[key] * 255, contrast, gamma, gain, invert) * p.a;
            const cctx = channelRefs[key].current.getContext('2d');
            const a2 = CMYK_ANGLE[key] * Math.PI / 180;
            markDot(cctx, x, y, cell, d, { r: 0, g: 0, b: 0 }, p.a, a2, shape);
            markDot(actx, x, y, cell, d, CMYK_COLOR[key], p.a, a2, shape);
          }
        }
      }
    }
  };

  const renderView = () => {
    const s = srcRef.current, out = canvasRef.current;
    if (!s || !out || !s.width) return;
    out.width = s.width; out.height = s.height;
    const octx = out.getContext('2d');
    octx.clearRect(0, 0, out.width, out.height);
    if (view === 'original') octx.drawImage(s, 0, 0);
    else if (view === 'art') octx.drawImage(artRef.current, 0, 0);
    else if (view === 'base') octx.drawImage(baseRef.current, 0, 0);
    else {
      octx.fillStyle = garmentColor;
      octx.fillRect(0, 0, out.width, out.height);
      if (underbase) { octx.save(); octx.globalAlpha = baseOpacity / 100; octx.drawImage(baseRef.current, 0, 0); octx.restore(); }
      octx.drawImage(artRef.current, 0, 0);
    }
  };

  const regenerate = () => {
    if (!srcRef.current?.width) return;
    setBusy(true);
    requestAnimationFrame(() => {
      try {
        computeHalftone();
        renderView();
        setMeta({ w: srcRef.current.width, h: srcRef.current.height });
      } catch (e) { setErr(String(e.message || e)); logError('halftone-smart', e); }
      setBusy(false);
    });
  };

  // Full regeneration: anything that changes the actual dot pattern.
  useEffect(() => { if (ready) regenerate(); /* eslint-disable-next-line */ }, [dpi, lpi, mode, shape, angle, contrast, gamma, gain, inkColor, invert, choke, removeLight, threshold]);
  // Cheap redraw only: these affect compositing, not the generated dots/base.
  useEffect(() => { if (ready) renderView(); /* eslint-disable-next-line */ }, [view, garmentColor, underbase, baseOpacity]);

  const onFile = async (file) => {
    setErr('');
    try {
      const { img } = await loadImageFromFile(file);
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const sc = Math.min(1, MAX_DIM / Math.max(w0, h0));
      const s = srcRef.current;
      s.width = Math.round(w0 * sc); s.height = Math.round(h0 * sc);
      s.getContext('2d').drawImage(img, 0, 0, s.width, s.height);
      thumbImgRef.current = img;
      setFileName(file.name);
      setReady(true);
      regenerate();
    } catch (e) { setErr(String(e.message || e)); }
  };

  const reset = () => {
    setReady(false); setFileName(''); setMeta(null); setView('preview'); setErr('');
    [srcRef, artRef, baseRef, cRef, mRef, yRef, kRef, canvasRef].forEach((r) => { if (r.current) { r.current.width = 0; r.current.height = 0; } });
  };

  const generar = async () => {
    if (!ready) return;
    const chk = await checkLimit('halftone-smart', planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr('');
    artRef.current.toBlob(async (blob) => {
      await recordJob({
        tool: 'halftone-smart', title: `Semitono ${fileName || 'diseño'}`, status: 'done',
        inputPreview: thumbImgRef.current ? makeThumb(thumbImgRef.current) : '', outputPreview: '',
        params: { dpi, lpi, technique, mode, shape, angle, contrast, gamma, gain, inkColor, invert, garmentColor, underbase, choke, baseOpacity, removeLight, threshold },
        result: { width: srcRef.current.width, height: srcRef.current.height, dpi, lpi, mode, shape },
        resultBlob: blob, resultFilename: 'semitono_pro.png',
      });
      await logUsage('halftone-smart', 'run', { mode, dpi, lpi });
      loadJobs();
    }, 'image/png');
  };

  const downloadCanvas = (canvas, filename) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  const cell = Math.max(2, dpi / lpi);

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Producción</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>DPI</span>
            <input type="number" min="72" max="1200" value={dpi} onChange={(e) => setDpi(+e.target.value || 72)} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>LPI</span>
            <input type="number" min="10" max="150" value={lpi} onChange={(e) => setLpi(+e.target.value || 10)} className={inputCls} />
          </label>
        </div>
        <div className="text-[11px] text-white/40 mt-2">Celda calculada: {cell.toFixed(2)} px</div>
        <label className="block mt-3">
          <span className={labelCls}>Técnica</span>
          <select value={technique} onChange={(e) => setTechnique(e.target.value)} className={inputCls}>
            <option value="dtf">DTF / DTG</option>
            <option value="screen">Serigrafía</option>
          </select>
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Modo</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls}>
            <option value="color">Color indexado visual</option>
            <option value="mono">Una tinta</option>
            <option value="cmyk">Separación CMYK</option>
            <option value="grayscale">Escala de grises</option>
          </select>
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Forma de punto</span>
          <select value={shape} onChange={(e) => setShape(e.target.value)} className={inputCls}>
            <option value="round">Redondo</option>
            <option value="ellipse">Elíptico</option>
            <option value="square">Cuadrado</option>
            <option value="line">Línea</option>
            <option value="diamond">Diamante</option>
          </select>
        </label>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Ajustes</div>
        <label className="block">
          <span className={labelCls}>Ángulo: {angle}°</span>
          <input type="range" min="-90" max="90" step="0.5" value={angle} onChange={(e) => setAngle(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Contraste: {(+contrast).toFixed(2)}</span>
          <input type="range" min="0.2" max="3" step="0.05" value={contrast} onChange={(e) => setContrast(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Gamma: {(+gamma).toFixed(2)}</span>
          <input type="range" min="0.2" max="3" step="0.05" value={gamma} onChange={(e) => setGamma(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Ganancia de punto: {gain}%</span>
          <input type="range" min="-30" max="30" value={gain} onChange={(e) => setGain(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Color de tinta</span>
          <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="w-full h-9 rounded border border-[#00AEEF]/30 bg-black/50" />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70 mt-3">
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="accent-[#00F0FF]" /> Invertir densidad
        </label>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Prenda y base blanca</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {GARMENTS.map((g) => (
            <button key={g} type="button" onClick={() => setGarmentColor(g)}
              className={`w-8 h-8 rounded-full border-2 ${garmentColor === g ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: g }} />
          ))}
        </div>
        <label className="block">
          <span className={labelCls}>Color de prenda personalizado</span>
          <input type="color" value={garmentColor} onChange={(e) => setGarmentColor(e.target.value)} className="w-full h-9 rounded border border-[#00AEEF]/30 bg-black/50" />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70 mt-3">
          <input type="checkbox" checked={underbase} onChange={(e) => setUnderbase(e.target.checked)} className="accent-[#00F0FF]" /> Mostrar base blanca
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Choke de base: {choke} px</span>
          <input type="range" min="0" max="12" value={choke} onChange={(e) => setChoke(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Opacidad base: {baseOpacity}%</span>
          <input type="range" min="0" max="100" value={baseOpacity} onChange={(e) => setBaseOpacity(+e.target.value)} className={rangeCls} />
        </label>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Fondo</div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={removeLight} onChange={(e) => setRemoveLight(e.target.checked)} className="accent-[#00F0FF]" /> Eliminar fondo claro
        </label>
        <label className="block mt-3">
          <span className={labelCls}>Umbral: {threshold}</span>
          <input type="range" min="180" max="255" value={threshold} onChange={(e) => setThreshold(+e.target.value)} className={rangeCls} />
        </label>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || (limit && !limit.allowed)} onClick={generar} className="nx-btn-primary w-full py-3 disabled:opacity-40">Generar</button>
        <button onClick={reset} className="nx-btn-ghost w-full py-2.5 inline-flex items-center justify-center gap-2"><RefreshCw size={14}/>Restablecer</button>
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        {limit && limit.remaining >= 0 && (
          <div className="text-[11px] text-white/40 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
        )}
      </div>

      {ready && (
        <div className="pt-4 border-t border-white/10 space-y-2">
          <div className="font-display uppercase tracking-widest text-xs text-white/60">Exportar</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => downloadCanvas(artRef.current, 'semitono_pro.png')} className="nx-btn-ghost py-2 text-xs inline-flex items-center justify-center gap-1.5"><Download size={12}/>PNG semitono</button>
            <button onClick={() => downloadCanvas(baseRef.current, 'base_blanca_choke.png')} className="nx-btn-ghost py-2 text-xs inline-flex items-center justify-center gap-1.5"><Download size={12}/>Base blanca</button>
            <button onClick={() => downloadCanvas(cRef.current, 'canal_cian.png')} className="nx-btn-ghost py-2 text-xs">Cian</button>
            <button onClick={() => downloadCanvas(mRef.current, 'canal_magenta.png')} className="nx-btn-ghost py-2 text-xs">Magenta</button>
            <button onClick={() => downloadCanvas(yRef.current, 'canal_amarillo.png')} className="nx-btn-ghost py-2 text-xs">Amarillo</button>
            <button onClick={() => downloadCanvas(kRef.current, 'canal_negro.png')} className="nx-btn-ghost py-2 text-xs">Negro</button>
          </div>
        </div>
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
    <ToolShell eyebrow="NEONEXA TOOLS" title="Halftone Studio Pro" subtitle="Semitonos profesionales para DTF, DTG y serigrafía: separación CMYK, base blanca con choke y vista sobre prenda." sidebar={sidebar}>
      <div className="flex flex-col gap-5 h-full">
        {!ready && <Dropzone onFile={onFile} hint="PNG, JPG o WEBP. Se procesa 100% en tu navegador." />}
        {ready && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-white/50 truncate">{fileName}{meta ? ` · ${meta.w} × ${meta.h}px` : ''}</div>
              <div className="flex flex-wrap gap-2">
                {VIEWS.map((v) => (
                  <button key={v.id} onClick={() => setView(v.id)}
                    className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-widest ${view === v.id ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="nx-checker rounded-lg overflow-auto flex-1 min-h-[400px] p-2 flex items-center justify-center relative">
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><Loader2 className="animate-spin text-[#00AEEF]" size={28}/></div>}
              <canvas ref={canvasRef} className="max-w-full max-h-full" />
            </div>
          </>
        )}
        {/* offscreen working canvases */}
        <canvas ref={srcRef} className="hidden" />
        <canvas ref={artRef} className="hidden" />
        <canvas ref={baseRef} className="hidden" />
        <canvas ref={cRef} className="hidden" />
        <canvas ref={mRef} className="hidden" />
        <canvas ref={yRef} className="hidden" />
        <canvas ref={kRef} className="hidden" />
      </div>
    </ToolShell>
  );
}
