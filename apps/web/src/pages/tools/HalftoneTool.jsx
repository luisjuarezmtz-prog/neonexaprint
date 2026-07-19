import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import { useAuth } from '@/lib/auth';
import { loadImageFile, downloadCanvasDpi, saveDesign } from '@/lib/toolHelpers';
import { Upload, Download, Save, Sparkles } from 'lucide-react';

const PREVIEW_W = 900;
const EXPORT_DPI = 300;

/**
 * Self-contained clustered-dot (AM) halftone renderer — no external libraries.
 *
 * Everything runs on the 2D canvas + typed arrays, so it works offline with no
 * CDN dependency. Pipeline:
 *  1. Draw the (possibly transparent) image into an offscreen canvas and read
 *     its pixels once.
 *  2. Build per-channel tone fields (CMYK with GCR for color, or luma for mono)
 *     plus an alpha field, all as Float32Array.
 *  3. Smooth each field with a fast summed-area-table (integral image) box blur
 *     sized to the halftone cell. This removes JPEG noise and gives a true
 *     per-cell area average -> perfectly uniform dots (Pixelia-grade).
 *  4. Lay uniform circular clustered dots on a rotated grid, radius driven only
 *     by the local tone; a 50% alpha coverage gate keeps edges crisp and the
 *     background transparent.
 *  5. Render 2x supersampled, then downscale with high-quality smoothing for
 *     razor-clean anti-aliased dot edges.
 */

function bilinear(map, W, H, x, y) {
  if (x < 0) x = 0; else if (x > W - 1) x = W - 1;
  if (y < 0) y = 0; else if (y > H - 1) y = H - 1;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const fx = x - x0, fy = y - y0;
  const a = map[y0 * W + x0], b = map[y0 * W + x1];
  const c = map[y1 * W + x0], d = map[y1 * W + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

// Fast box blur via summed-area table. radius in pixels; operates in-place-ish.
function boxBlur(src, W, H, radius) {
  if (radius < 1) return src;
  // Integral image with +1 padding row/col.
  const IW = W + 1;
  const sat = new Float64Array(IW * (H + 1));
  for (let y = 0; y < H; y++) {
    let rowSum = 0;
    const so = y * W;
    const io = (y + 1) * IW;
    const iprev = y * IW;
    for (let x = 0; x < W; x++) {
      rowSum += src[so + x];
      sat[io + x + 1] = sat[iprev + x + 1] + rowSum;
    }
  }
  const out = new Float32Array(W * H);
  const r = radius;
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(H - 1, y + r);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(W - 1, x + r);
      const A = sat[y0 * IW + x0];
      const B = sat[y0 * IW + (x1 + 1)];
      const C = sat[(y1 + 1) * IW + x0];
      const D = sat[(y1 + 1) * IW + (x1 + 1)];
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      out[y * W + x] = (D - B - C + A) / area;
    }
  }
  return out;
}

function buildMaps(img, W, H, cellPx, p) {
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d', { alpha: true });
  octx.clearRect(0, 0, W, H);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(img, 0, 0, W, H);
  const data = octx.getImageData(0, 0, W, H).data;
  const px = W * H;

  const rawAlpha = new Float32Array(px);
  for (let i = 0; i < px; i++) rawAlpha[i] = data[i * 4 + 3] / 255;

  // Blur radius tied to cell size for a clean per-cell average.
  const radius = Math.max(1, Math.round(cellPx * 0.5));

  const channels = [];
  if (p.colorMode) {
    const cyan = new Float32Array(px), mag = new Float32Array(px);
    const yel = new Float32Array(px), blk = new Float32Array(px);
    for (let i = 0; i < px; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const kk = 1 - Math.max(r, g, b) / 255;
      blk[i] = kk;
      if (kk >= 0.999) continue;
      const inv = 1 / (1 - kk);
      cyan[i] = (1 - r / 255 - kk) * inv;
      mag[i]  = (1 - g / 255 - kk) * inv;
      yel[i]  = (1 - b / 255 - kk) * inv;
    }
    channels.push({ fill: '#00AEEF', angle: p.angle + 15, map: boxBlur(cyan, W, H, radius) });
    channels.push({ fill: '#EC008C', angle: p.angle + 75, map: boxBlur(mag, W, H, radius) });
    channels.push({ fill: '#FFE800', angle: p.angle,       map: boxBlur(yel, W, H, radius) });
    channels.push({ fill: '#1A1A1A', angle: p.angle + 45, map: boxBlur(blk, W, H, radius) });
  } else {
    const lum = new Float32Array(px);
    for (let i = 0; i < px; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      lum[i] = 1 - (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    }
    channels.push({ fill: p.dotColor, angle: p.angle, map: boxBlur(lum, W, H, radius) });
  }

  const alpha = boxBlur(rawAlpha, W, H, radius);
  return { channels, alpha };
}

function renderHalftone(img, canvas, W, H, cellPx, p) {
  const SS = W * H > 4_000_000 ? 1.5 : 2;
  const sW = Math.round(W * SS), sH = Math.round(H * SS);
  const cell = cellPx * SS;

  const buf = document.createElement('canvas');
  buf.width = sW; buf.height = sH;
  const ctx = buf.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, sW, sH);

  const { channels, alpha } = buildMaps(img, W, H, cellPx, p);
  const diag = Math.ceil(Math.sqrt(sW * sW + sH * sH));
  const RMAX = cell * Math.SQRT1_2;

  const drawChannel = (fill, angleDeg, map) => {
    ctx.fillStyle = fill;
    const a = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    ctx.beginPath();
    for (let v = -diag; v < diag; v += cell) {
      for (let u = -diag; u < diag; u += cell) {
        const x = u * cos - v * sin + sW / 2;
        const y = u * sin + v * cos + sH / 2;
        if (x < -cell || x >= sW + cell || y < -cell || y >= sH + cell) continue;
        const px = x / SS, py = y / SS;
        if (bilinear(alpha, W, H, px, py) < 0.5) continue;
        let val = bilinear(map, W, H, px, py);
        if (p.invert) val = 1 - val;
        if (val <= 0.006) continue;
        const dr = Math.sqrt(Math.min(1, val)) * RMAX;
        if (dr > 0.3) { ctx.moveTo(x + dr, y); ctx.arc(x, y, dr, 0, Math.PI * 2); }
      }
    }
    ctx.fill();
  };

  if (p.colorMode) ctx.globalCompositeOperation = 'multiply';
  for (const c of channels) drawChannel(c.fill, c.angle, c.map);
  ctx.globalCompositeOperation = 'source-over';

  canvas.width = W; canvas.height = H;
  const octx = canvas.getContext('2d', { alpha: true });
  octx.clearRect(0, 0, W, H);
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(buf, 0, 0, W, H);
}

export default function HalftoneTool() {
  const { isAuthed } = useAuth();
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [title, setTitle] = useState('Mi semitono');
  const [dotSize, setDotSize] = useState(8);
  const [angle, setAngle] = useState(45);
  const [density, setDensity] = useState(100);
  const [invert, setInvert] = useState(false);
  const [colorMode, setColorMode] = useState(true);
  const [dotColor, setDotColor] = useState('#0B0B0B');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const rafRef = useRef(0);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { img: i } = await loadImageFile(f);
    setImg(i);
  };

  const dims = (targetW) => {
    const ratio = img.naturalHeight / img.naturalWidth;
    const W = Math.round(targetW);
    const H = Math.round(W * ratio);
    return { W, H, k: W / PREVIEW_W };
  };

  const params = () => ({ angle, invert, colorMode, dotColor });

  useEffect(() => {
    if (!img) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current; if (!canvas) return;
      const W = Math.min(PREVIEW_W, img.naturalWidth < PREVIEW_W ? PREVIEW_W : img.naturalWidth);
      const { W: w, H: h } = dims(W);
      const densityFactor = Math.max(0.1, density / 100);
      const cell = Math.max(2, dotSize / densityFactor);
      renderHalftone(img, canvas, w, h, cell, params());
    });
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, dotSize, angle, density, invert, colorMode, dotColor]);

  const download = () => {
    if (!img) { setMsg('Sube una imagen primero.'); return; }
    setBusy(true); setMsg('Generando 300 DPI...');
    requestAnimationFrame(() => {
      try {
        const longSide = Math.max(img.naturalWidth, img.naturalHeight);
        const targetLong = Math.min(3300, Math.max(2400, longSide));
        const outW = img.naturalWidth >= img.naturalHeight
          ? targetLong
          : Math.round(targetLong * (img.naturalWidth / img.naturalHeight));
        const { W, H, k } = dims(outW);
        const densityFactor = Math.max(0.1, density / 100);
        const cell = Math.max(2, dotSize / densityFactor) * k;
        const out = document.createElement('canvas');
        renderHalftone(img, out, W, H, cell, params());
        downloadCanvasDpi(out, `${title || 'semitono'}-300dpi.png`, EXPORT_DPI);
        setMsg('Descargado a 300 DPI.');
      } catch (e) { setMsg(e.message || 'Error al exportar.'); }
      finally { setBusy(false); }
    });
  };

  const save = async () => {
    if (!img) { setMsg('Sube una imagen primero.'); return; }
    setBusy(true); setMsg('');
    try {
      const thumb = document.createElement('canvas');
      thumb.width = 400; thumb.height = 400;
      const tctx = thumb.getContext('2d');
      tctx.clearRect(0,0,400,400);
      const c = canvasRef.current;
      const r = c.height / c.width;
      tctx.drawImage(c, 0, (400 - 400*r)/2, 400, 400*r);
      await saveDesign({
        title: title || 'Semitono', tool: 'halftone',
        thumbnail: thumb.toDataURL('image/png'),
        config: { dotSize, angle, density, invert, colorMode, dotColor },
      });
      setMsg('Guardado en tu panel.');
    } catch (e) { setMsg(e.message || 'Error al guardar.'); }
    finally { setBusy(false); }
  };

  const presets = [
    { name: 'Negro', dot: '#0B0B0B' },
    { name: 'Cyan', dot: '#00F0FF' },
    { name: 'Magenta', dot: '#FF2D95' },
    { name: 'Yellow', dot: '#FFD400' },
    { name: 'Blanco', dot: '#FFFFFF' },
  ];

  return (
    <ToolShell
      eyebrow="HERRAMIENTA · HALFTONE LAB"
      title="Conversor de Semitonos"
      subtitle="Convierte cualquier foto a un patrón de puntos limpio y uniforme, listo para DTF, serigrafía o pósters."
      sidebar={
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-[11px] font-display tracking-[0.14em] uppercase px-3 py-2 rounded border border-[#00F0FF]/30 text-[#00F0FF]">
            <Sparkles size={13}/> Motor local listo · sin conexión
          </div>
          <div>
            <label className={labelCls}>Nombre</label>
            <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)}/>
          </div>
          <label className="nx-btn-ghost px-4 py-3 cursor-pointer inline-flex items-center gap-2 text-xs w-full justify-center">
            <Upload size={14}/> {img ? 'Cambiar imagen' : 'Subir imagen'}
            <input type="file" accept="image/*" hidden onChange={onFile}/>
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded border border-white/10 bg-black/30">
            <button onClick={()=>setColorMode(true)}
              className={`py-2 rounded text-xs font-display tracking-[0.15em] uppercase transition ${colorMode ? 'bg-[#00AEEF] text-[#0B0B0B]' : 'text-white/60 hover:text-white'}`}>
              Color
            </button>
            <button onClick={()=>setColorMode(false)}
              className={`py-2 rounded text-xs font-display tracking-[0.15em] uppercase transition ${!colorMode ? 'bg-[#00AEEF] text-[#0B0B0B]' : 'text-white/60 hover:text-white'}`}>
              Monocromo
            </button>
          </div>
          {colorMode ? (
            <p className="text-xs text-white/45 leading-relaxed">Semitono CMYK a color: conserva la paleta original aplicando puntos limpios en cian, magenta, amarillo y negro.</p>
          ) : (
            <div>
              <label className={labelCls}>Color del punto</label>
              <div className="grid grid-cols-5 gap-1 mb-2">
                {presets.map(p => (
                  <button key={p.name} onClick={()=>setDotColor(p.dot)}
                    className="aspect-square rounded border border-white/10 flex items-center justify-center overflow-hidden nx-checker"
                    title={p.name}>
                    <div className="w-4 h-4 rounded-full border border-white/20" style={{ background: p.dot }}/>
                  </button>
                ))}
              </div>
              <input type="color" value={dotColor} onChange={e=>setDotColor(e.target.value)} className="w-full h-10 rounded bg-black/40 border border-white/15"/>
            </div>
          )}

          <div className="pt-1 space-y-5 border-t border-white/10">
            <div className="pt-4">
              <label className={labelCls}>Tamaño del punto: {dotSize}px</label>
              <input type="range" min="3" max="24" value={dotSize} onChange={e=>setDotSize(+e.target.value)} className={rangeCls}/>
            </div>
            <div>
              <label className={labelCls}>Ángulo: {angle}°</label>
              <input type="range" min="0" max="180" value={angle} onChange={e=>setAngle(+e.target.value)} className={rangeCls}/>
            </div>
            <div>
              <label className={labelCls}>Densidad: {density}%</label>
              <input type="range" min="40" max="160" value={density} onChange={e=>setDensity(+e.target.value)} className={rangeCls}/>
              <p className="text-[11px] text-white/40 mt-1">Controla la separación entre puntos del patrón.</p>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked={invert} onChange={e=>setInvert(e.target.checked)} className="accent-[#00F0FF]"/>
            Invertir tonos
          </label>
          <div className="flex flex-col gap-2 pt-2">
            <button disabled={busy} onClick={download} className="nx-btn-primary px-4 py-3 flex items-center justify-center gap-2 text-xs disabled:opacity-60"><Download size={14}/>Descargar PNG · 300 DPI</button>
            {isAuthed ? (
              <button disabled={busy} onClick={save} className="nx-btn-ghost px-4 py-3 flex items-center justify-center gap-2 text-xs"><Save size={14}/>Guardar en mi panel</button>
            ) : (
              <Link to="/login" className="nx-btn-ghost px-4 py-3 text-center text-xs">Inicia sesión para guardar</Link>
            )}
            {msg && <div className="text-xs text-[#00F0FF]">{msg}</div>}
          </div>
        </div>
      }
    >
      <div className="flex items-center justify-center min-h-[500px]">
        {img ? (
          <div className="relative nx-checker rounded shadow-2xl shadow-[#00AEEF]/10 border border-white/10 inline-flex">
            <canvas ref={canvasRef} className="max-w-full max-h-[70vh] block"/>
          </div>
        ) : (
          <div className="text-center px-8 py-16">
            <Sparkles size={36} className="mx-auto text-[#FF2D95] mb-4"/>
            <div className="font-display tracking-[0.3em] text-sm uppercase">Sube una imagen para comenzar</div>
            <p className="text-white/50 mt-2 text-sm max-w-sm mx-auto">Funciona mejor con fotos de alto contraste, retratos o ilustraciones.</p>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
