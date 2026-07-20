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
function isDarkColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}
function correctedVal(v, contrast, gamma, gain, invert) {
  let x = v / 255;
  x = clampVal((x - 0.5) * contrast + 0.5);
  x = Math.pow(x, gamma);
  x = clampVal(x + gain / 100);
  return invert ? 1 - x : x;
}
function sampleRegion(data, w, h, cx, cy, r, bgMask) {
  let R = 0, G = 0, B = 0, A = 0, N = 0;
  const st = Math.max(1, Math.floor(r / 2));
  for (let y = Math.max(0, ~~(cy - r)); y < Math.min(h, cy + r); y += st) {
    for (let x = Math.max(0, ~~(cx - r)); x < Math.min(w, cx + r); x += st) {
      const idx = y * w + x, i = idx * 4;
      let a = data[i + 3] / 255;
      if (bgMask && bgMask[idx]) a = 0;
      R += data[i] * a; G += data[i + 1] * a; B += data[i + 2] * a; A += a; N++;
    }
  }
  if (!A) return { r: 0, g: 0, b: 0, a: 0, lum: 255 };
  const r0 = R / A, g0 = G / A, b0 = B / A;
  return { r: r0, g: g0, b: b0, a: A / N, lum: 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0 };
}
// Flood-fill background removal: only removes light/dark pixels that are
// CONNECTED to the image border, so legitimate highlights or dark outlines
// deep inside the artwork survive even if they share the same luminance
// range as the real background — a blanket threshold would erase both alike.
function floodFillBackgroundMask(data, w, h, bgMode, threshold) {
  const mask = new Uint8Array(w * h);
  if (bgMode === 'none') return mask;
  const isBg = (i) => {
    const lum = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    return bgMode === 'light' ? lum >= threshold : lum <= threshold;
  };
  const visited = new Uint8Array(w * h);
  const stack = [];
  const seed = (idx) => { if (!visited[idx] && isBg(idx)) { visited[idx] = 1; stack.push(idx); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    mask[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  return mask;
}
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
const MAX_COLOR_DIST = Math.sqrt(255 * 255 * 3);
function markDot(ctx, x, y, size, d, col, alpha, ang, shape, minS = 0, maxS = Infinity) {
  if (d <= 0.001 || alpha <= 0.001) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(${col.r | 0},${col.g | 0},${col.b | 0},${alpha})`;
  const s = Math.max(minS, Math.min(maxS, size * Math.sqrt(clampVal(d))));
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
function clearCell(ctx, x, y, size, ang) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.clearRect(-size / 2, -size / 2, size, size);
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

const BAYER = {
  4: [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]],
  8: [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
  ],
};
// Ordered dithering: compares a corrected coverage value against a periodic
// threshold matrix instead of drawing a variable-size dot. Runs at native
// pixel resolution — the "cell" size just controls how large each matrix
// entry is drawn (coarser = more visible texture, like a real halftone screen).
function renderBayer(actx, data, w, h, cell, contrast, gamma, gain, invert, n, protectHi, hiThreshold, protectLo, loThreshold, ink, bgMask, darkGarment) {
  const matrix = BAYER[n] || BAYER[8];
  const blockPx = Math.max(1, Math.round(cell / n));
  const id = actx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      const a = (bgMask && bgMask[idx]) ? 0 : data[i + 3] / 255;
      if (a <= 0.01) continue;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const protect = (protectHi && lum >= hiThreshold) || (protectLo && lum <= loThreshold);
      const coverage = protect ? 1 : correctedVal(darkGarment ? lum : 255 - lum, contrast, gamma, gain, invert);
      const mx = Math.floor(x / blockPx) % n, my = Math.floor(y / blockPx) % n;
      const th = (matrix[my][mx] + 0.5) / (n * n);
      if (coverage <= th) continue;
      id.data[i] = ink.r; id.data[i + 1] = ink.g; id.data[i + 2] = ink.b; id.data[i + 3] = Math.round(255 * a);
    }
  }
  actx.putImageData(id, 0, 0);
}
const DIFFUSION_KERNELS = {
  floyd: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
  jjn: [
    [1, 0, 7 / 48], [2, 0, 5 / 48], [-2, 1, 3 / 48], [-1, 1, 5 / 48], [0, 1, 7 / 48], [1, 1, 5 / 48], [2, 1, 3 / 48],
    [-2, 2, 1 / 48], [-1, 2, 3 / 48], [0, 2, 5 / 48], [1, 2, 3 / 48], [2, 2, 1 / 48],
  ],
};
// Classic error-diffusion dithering (Floyd–Steinberg / Atkinson / JJN): quantizes
// each pixel to full ink or none, in raster order, propagating the rounding
// error to not-yet-visited neighbors per the chosen kernel.
function renderDiffusion(actx, data, w, h, contrast, gamma, gain, invert, algo, protectHi, hiThreshold, protectLo, loThreshold, ink, bgMask, darkGarment) {
  const cov = new Float32Array(w * h), alphaBuf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const di = i * 4;
    const lum = 0.2126 * data[di] + 0.7152 * data[di + 1] + 0.0722 * data[di + 2];
    const protect = (protectHi && lum >= hiThreshold) || (protectLo && lum <= loThreshold);
    cov[i] = protect ? 1 : correctedVal(darkGarment ? lum : 255 - lum, contrast, gamma, gain, invert);
    alphaBuf[i] = (bgMask && bgMask[i]) ? 0 : data[di + 3] / 255;
  }
  const kernel = DIFFUSION_KERNELS[algo] || DIFFUSION_KERNELS.floyd;
  const id = actx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alphaBuf[i] <= 0.01) continue;
      const old = clampVal(cov[i]);
      const on = old >= 0.5;
      const err = old - (on ? 1 : 0);
      for (const [dx, dy, wgt] of kernel) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        cov[ny * w + nx] += err * wgt;
      }
      if (on) {
        const oi = i * 4;
        id.data[oi] = ink.r; id.data[oi + 1] = ink.g; id.data[oi + 2] = ink.b; id.data[oi + 3] = Math.round(255 * alphaBuf[i]);
      }
    }
  }
  actx.putImageData(id, 0, 0);
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
  const [angle, setAngle] = useState(45);
  const [contrast, setContrast] = useState(1.2);
  const [gamma, setGamma] = useState(1.8);
  const [gain, setGain] = useState(0);
  const [inkColor, setInkColor] = useState('#ffffff');
  const [invert, setInvert] = useState(false);
  const [garmentColor, setGarmentColor] = useState('#111111');
  const [underbase, setUnderbase] = useState(true);
  const [choke, setChoke] = useState(1);
  const [baseOpacity, setBaseOpacity] = useState(92);
  const [bgMode, setBgMode] = useState('dark'); // 'none' | 'light' | 'dark' — auto-follows garment color
  const [threshold, setThreshold] = useState(30);
  const [pickedColors, setPickedColors] = useState([]); // [{ hex }]
  const [pickTolerance, setPickTolerance] = useState(24);
  const [picking, setPicking] = useState(false);
  const [protectHighlights, setProtectHighlights] = useState(true);
  const [highlightThreshold, setHighlightThreshold] = useState(200);
  const [protectShadows, setProtectShadows] = useState(false);
  const [shadowThreshold, setShadowThreshold] = useState(55);
  const [hardEdges, setHardEdges] = useState(false);
  const [hardEdgeThreshold, setHardEdgeThreshold] = useState(128);
  const [pattern, setPattern] = useState('am'); // 'am' | 'bayer' | 'diffusion'
  const [bayerSize, setBayerSize] = useState(8);
  const [diffusionAlgo, setDiffusionAlgo] = useState('floyd');
  const [minDotPct, setMinDotPct] = useState(0);
  const [maxDotPct, setMaxDotPct] = useState(130);
  const [zoom, setZoom] = useState(100);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const [originalUrl, setOriginalUrl] = useState('');

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
    // "Bordes duros": snaps every alpha value to fully opaque or fully
    // transparent, removing anti-aliased/semi-transparent edge pixels —
    // matches NOVAGE's "Eliminar Semitransparencias" DTF finishing step.
    const applyHardEdges = () => {
      if (!hardEdges) return;
      const aid = actx.getImageData(0, 0, w, h);
      const d4 = aid.data;
      for (let i = 3; i < d4.length; i += 4) d4[i] = d4[i] >= hardEdgeThreshold ? 255 : 0;
      actx.putImageData(aid, 0, 0);
    };
    ['c', 'm', 'y', 'k'].forEach((k) => channelRefs[k].current.getContext('2d').clearRect(0, 0, w, h));

    const sctx = s.getContext('2d', { willReadFrequently: true });
    const im = sctx.getImageData(0, 0, w, h), data = im.data;
    const bgMask = floodFillBackgroundMask(data, w, h, bgMode, threshold);
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = bgMask[i] ? 0 : data[i * 4 + 3];
    const mask = dilateAlpha(alpha, w, h, choke);
    const bid = bctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      bid.data[i * 4] = 255; bid.data[i * 4 + 1] = 255; bid.data[i * 4 + 2] = 255; bid.data[i * 4 + 3] = mask[i];
    }
    bctx.putImageData(bid, 0, 0);

    if (pattern === 'bayer') {
      renderBayer(actx, data, w, h, cell, contrast, gamma, gain, invert, bayerSize, protectHighlights, highlightThreshold, protectShadows, shadowThreshold, hexToRgb(inkColor), bgMask, bgMode === 'dark');
      applyHardEdges();
      return;
    }
    if (pattern === 'diffusion') {
      renderDiffusion(actx, data, w, h, contrast, gamma, gain, invert, diffusionAlgo, protectHighlights, highlightThreshold, protectShadows, shadowThreshold, hexToRgb(inkColor), bgMask, bgMode === 'dark');
      applyHardEdges();
      return;
    }

    // "Colores protegidos": the untouched original image is the base layer, and
    // every cell gets converted to a normal color halftone dot EXCEPT the ones
    // matching a picked/protected color, which are left showing the original
    // flat pixels — confirmed against NOVAGE's actual behavior (their "Proteger
    // colores seleccionados" excludes the picked color FROM the halftone, it
    // doesn't restrict the halftone TO it).
    if (mode === 'picked') {
      const baseId = actx.createImageData(w, h);
      baseId.data.set(data);
      for (let i = 0; i < w * h; i++) baseId.data[i * 4 + 3] = alpha[i];
      actx.putImageData(baseId, 0, 0);
    }

    const diag = Math.hypot(w, h), co = Math.cos(ang), si = Math.sin(ang);
    const ink = hexToRgb(inkColor);
    const minS = cell * (minDotPct / 100), maxS = cell * (maxDotPct / 100);
    for (let gy = -diag; gy <= diag; gy += cell) {
      for (let gx = -diag; gx <= diag; gx += cell) {
        const x = w / 2 + gx * co - gy * si, y = h / 2 + gx * si + gy * co;
        if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue;
        const p = sampleRegion(data, w, h, x, y, cell * 0.48, bgMask);
        if (!p.a) continue;
        const protect = (protectHighlights && p.lum >= highlightThreshold) || (protectShadows && p.lum <= shadowThreshold);
        // Coverage direction flips with the garment: on a DARK garment, highlights
        // need solid ink (else the black fabric bleeds through and looks muddy) and
        // shadows are the ones that get perforated (letting black fabric read as
        // the shadow) — light = high coverage. On light/neutral, it's the opposite:
        // shadows need solid ink, highlights perforate to reveal the white fabric.
        const toneVal = bgMode === 'dark' ? p.lum : (255 - p.lum);
        if (mode === 'color') {
          // Dot size follows the sampled color's own luminance, like a real
          // photographic color separation — using only alpha here (as before) made
          // every fully-opaque flat-color design render at near-uniform, near-solid
          // dot size regardless of tone.
          const d = protect ? 1 : Math.max(0.02, correctedVal(toneVal, contrast, gamma, gain, invert) * p.a);
          markDot(actx, x, y, cell, d, p, p.a, ang, shape, minS, maxS);
        } else if (mode === 'mono' || mode === 'grayscale') {
          const d = protect ? 1 : correctedVal(toneVal, contrast, gamma, gain, invert) * p.a;
          markDot(actx, x, y, cell, d, mode === 'grayscale' ? { r: 30, g: 30, b: 30 } : ink, p.a, ang, shape, minS, maxS);
        } else if (mode === 'picked') {
          const toleranceDist = Math.max(1, (pickTolerance / 100) * MAX_COLOR_DIST);
          let isProtected = false;
          for (let idx = 0; idx < pickedColors.length; idx++) {
            const pc = hexToRgb(pickedColors[idx].hex);
            if (colorDistance(p.r, p.g, p.b, pc.r, pc.g, pc.b) <= toleranceDist) { isProtected = true; break; }
          }
          if (!isProtected) {
            const d = protect ? 1 : Math.max(0.02, correctedVal(toneVal, contrast, gamma, gain, invert) * p.a);
            clearCell(actx, x, y, cell, ang);
            markDot(actx, x, y, cell, d, p, p.a, ang, shape, minS, maxS);
          }
          // protected: leave the original pixels (already drawn as the base layer) untouched
        } else {
          const R = p.r / 255, G = p.g / 255, B = p.b / 255, K = 1 - Math.max(R, G, B), den = 1 - K || 1;
          const vals = { c: clampVal((1 - R - K) / den), m: clampVal((1 - G - K) / den), y: clampVal((1 - B - K) / den), k: clampVal(K) };
          for (const key of ['c', 'm', 'y', 'k']) {
            const d = correctedVal(vals[key] * 255, contrast, gamma, gain, invert) * p.a;
            const cctx = channelRefs[key].current.getContext('2d');
            const a2 = CMYK_ANGLE[key] * Math.PI / 180;
            markDot(cctx, x, y, cell, d, { r: 0, g: 0, b: 0 }, p.a, a2, shape, minS, maxS);
            markDot(actx, x, y, cell, d, CMYK_COLOR[key], p.a, a2, shape, minS, maxS);
          }
        }
      }
    }
    applyHardEdges();
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
  useEffect(() => { if (ready) regenerate(); /* eslint-disable-next-line */ }, [ready, dpi, lpi, mode, shape, angle, contrast, gamma, gain, inkColor, invert, choke, bgMode, threshold, pickedColors, pickTolerance, protectHighlights, highlightThreshold, protectShadows, shadowThreshold, pattern, bayerSize, diffusionAlgo, minDotPct, maxDotPct, hardEdges, hardEdgeThreshold]);
  // Cheap redraw only: these affect compositing, not the generated dots/base.
  useEffect(() => { if (ready) renderView(); /* eslint-disable-next-line */ }, [view, garmentColor, underbase, baseOpacity]);

  const onFile = async (file) => {
    setErr('');
    try {
      const { img, url } = await loadImageFromFile(file);
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      const sc = Math.min(1, MAX_DIM / Math.max(w0, h0));
      const s = srcRef.current;
      s.width = Math.round(w0 * sc); s.height = Math.round(h0 * sc);
      s.getContext('2d').drawImage(img, 0, 0, s.width, s.height);
      thumbImgRef.current = img;
      setFileName(file.name);
      setOriginalUrl(url);
      setReady(true);
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
        params: { dpi, lpi, technique, mode, shape, angle, contrast, gamma, gain, inkColor, invert, garmentColor, underbase, choke, baseOpacity, bgMode, threshold, pickedColors, pickTolerance, protectHighlights, highlightThreshold, protectShadows, shadowThreshold, pattern, bayerSize, diffusionAlgo, minDotPct, maxDotPct, hardEdges, hardEdgeThreshold },
        result: { width: srcRef.current.width, height: srcRef.current.height, dpi, lpi, mode, shape },
        resultBlob: blob, resultFilename: 'semitono_pro.png',
      });
      await logUsage('halftone-smart', 'run', { mode, dpi, lpi });
      loadJobs();
    }, 'image/png');
  };

  // Choosing a garment auto-configures background removal + which tones get
  // protected (kept as solid ink) to match it — matches NOVAGE's own copy:
  // dark garment protects highlights (shadows perforate, revealing the dark
  // fabric), light garment protects shadows (highlights perforate, revealing
  // the white fabric) — one choice drives the rest instead of 4 separate toggles.
  const applyGarment = (hex) => {
    setGarmentColor(hex);
    const dark = isDarkColor(hex);
    setBgMode(dark ? 'dark' : 'light');
    setThreshold(dark ? 30 : 248);
    setProtectHighlights(dark);
    setProtectShadows(!dark);
  };

  const handleCanvasClick = (e) => {
    if (!picking) return;
    const canvas = canvasRef.current, src = srcRef.current;
    if (!canvas || !src?.width) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const x = Math.max(0, Math.min(src.width - 1, Math.floor((e.clientX - rect.left) * scaleX)));
    const y = Math.max(0, Math.min(src.height - 1, Math.floor((e.clientY - rect.top) * scaleY)));
    const px = src.getContext('2d').getImageData(x, y, 1, 1).data;
    const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    setPickedColors((p) => (p.length >= 5 ? p : [...p, { hex }]));
    setPicking(false);
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
            <option value="picked">Colores protegidos</option>
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
        <label className="block mt-3">
          <span className={labelCls}>Patrón</span>
          <select value={pattern} onChange={(e) => setPattern(e.target.value)} className={inputCls}>
            <option value="am">Puntos variables (AM)</option>
            <option value="bayer">Tramado ordenado (Bayer)</option>
            <option value="diffusion">Difusión de error</option>
          </select>
        </label>
        {pattern === 'bayer' && (
          <label className="block mt-3">
            <span className={labelCls}>Tamaño de matriz</span>
            <select value={bayerSize} onChange={(e) => setBayerSize(+e.target.value)} className={inputCls}>
              <option value={4}>4×4</option>
              <option value={8}>8×8</option>
            </select>
          </label>
        )}
        {pattern === 'diffusion' && (
          <label className="block mt-3">
            <span className={labelCls}>Algoritmo</span>
            <select value={diffusionAlgo} onChange={(e) => setDiffusionAlgo(e.target.value)} className={inputCls}>
              <option value="floyd">Floyd–Steinberg</option>
              <option value="atkinson">Atkinson</option>
              <option value="jjn">Jarvis–Judice–Ninke</option>
            </select>
          </label>
        )}
        {pattern !== 'am' && <div className="text-[11px] text-white/40 mt-2">Este patrón usa una sola tinta (color de tinta) e ignora el modo de color.</div>}
        {pattern === 'am' && (
          <>
            <label className="block mt-3">
              <span className={labelCls}>Punto mínimo: {minDotPct}%</span>
              <input type="range" min="0" max="90" value={minDotPct} onChange={(e) => setMinDotPct(+e.target.value)} className={rangeCls} />
            </label>
            <label className="block mt-3">
              <span className={labelCls}>Punto máximo: {maxDotPct}%</span>
              <input type="range" min="10" max="200" value={maxDotPct} onChange={(e) => setMaxDotPct(+e.target.value)} className={rangeCls} />
              <span className="text-[11px] text-white/40 mt-1 block">Arriba de 100% los puntos se solapan en zonas sólidas (contornos, negros) para que se vean como línea continua en vez de puntos separados — compensa la ganancia de punto real de impresión.</span>
            </label>
          </>
        )}
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
        <label className="flex items-center gap-2 text-sm text-white/70 mt-3">
          <input type="checkbox" checked={protectHighlights} onChange={(e) => setProtectHighlights(e.target.checked)} className="accent-[#00F0FF]" /> Proteger luces
        </label>
        {protectHighlights && (
          <label className="block mt-3">
            <span className={labelCls}>Umbral de protección: {highlightThreshold}</span>
            <input type="range" min="180" max="255" value={highlightThreshold} onChange={(e) => setHighlightThreshold(+e.target.value)} className={rangeCls} />
            <span className="text-[11px] text-white/40 mt-1 block">Las zonas más claras que este valor quedan como tinta sólida en vez de perforarse.</span>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm text-white/70 mt-3">
          <input type="checkbox" checked={protectShadows} onChange={(e) => setProtectShadows(e.target.checked)} className="accent-[#00F0FF]" /> Proteger sombras
        </label>
        {protectShadows && (
          <label className="block mt-3">
            <span className={labelCls}>Umbral de protección: {shadowThreshold}</span>
            <input type="range" min="0" max="80" value={shadowThreshold} onChange={(e) => setShadowThreshold(+e.target.value)} className={rangeCls} />
            <span className="text-[11px] text-white/40 mt-1 block">Las zonas más oscuras que este valor quedan como tinta sólida en vez de perforarse (útil para prenda clara).</span>
          </label>
        )}
      </div>

      {mode === 'picked' && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Colores sin semitono</div>
          <div className="text-[11px] text-white/40 mb-3">El resto de la imagen se convierte a semitono a color normal; estos colores quedan protegidos (planos, sin puntos).</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {pickedColors.map((pc, i) => (
              <div key={i} className="relative">
                <div className="w-8 h-8 rounded border-2 border-white/20" style={{ background: pc.hex }} />
                <button type="button" onClick={() => setPickedColors((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/80 text-white/70 text-[10px] leading-none flex items-center justify-center hover:text-[#FF2D95]">×</button>
              </div>
            ))}
            {pickedColors.length < 5 && (
              <button type="button" onClick={() => setPicking(true)}
                className={`w-8 h-8 rounded border-2 border-dashed flex items-center justify-center text-sm ${picking ? 'border-[#00F0FF] text-[#00F0FF] animate-pulse' : 'border-white/30 text-white/50'}`}>+</button>
            )}
          </div>
          <div className="text-[11px] text-white/40 mb-3">{picking ? 'Haz clic sobre la imagen (vista "Original" recomendada) para tomar el color a proteger.' : `${pickedColors.length} de 5 colores protegidos.`}</div>
          <label className="block">
            <span className={labelCls}>Tolerancia de color: {pickTolerance}</span>
            <input type="range" min="1" max="100" value={pickTolerance} onChange={(e) => setPickTolerance(+e.target.value)} className={rangeCls} />
          </label>
        </div>
      )}

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Prenda y base blanca</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {GARMENTS.map((g) => (
            <button key={g} type="button" onClick={() => applyGarment(g)}
              className={`w-8 h-8 rounded-full border-2 ${garmentColor === g ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: g }} />
          ))}
        </div>
        <label className="block">
          <span className={labelCls}>Color de prenda personalizado</span>
          <input type="color" value={garmentColor} onChange={(e) => applyGarment(e.target.value)} className="w-full h-9 rounded border border-[#00AEEF]/30 bg-black/50" />
        </label>
        <div className="text-[11px] text-white/40 mt-1">El fondo y la protección de luces se ajustan automáticamente según la prenda; puedes anularlos abajo en "Fondo".</div>
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
        <label className="block">
          <span className={labelCls}>Eliminar fondo</span>
          <select value={bgMode} onChange={(e) => { const v = e.target.value; setBgMode(v); setThreshold(v === 'dark' ? 30 : 248); }} className={inputCls}>
            <option value="none">Ninguno</option>
            <option value="light">Claro (para prenda clara)</option>
            <option value="dark">Oscuro (para prenda oscura)</option>
          </select>
        </label>
        {bgMode !== 'none' && (
          <label className="block mt-3">
            <span className={labelCls}>{bgMode === 'dark' ? 'Tolerancia de negro' : 'Umbral'}: {threshold}</span>
            <input type="range" min={bgMode === 'dark' ? 0 : 180} max={bgMode === 'dark' ? 80 : 255} value={threshold} onChange={(e) => setThreshold(+e.target.value)} className={rangeCls} />
          </label>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Acabado DTF</div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={hardEdges} onChange={(e) => setHardEdges(e.target.checked)} className="accent-[#00F0FF]" /> Eliminar semitransparencias (bordes duros)
        </label>
        <div className="text-[11px] text-white/40 mt-1">Quita el antialiasing para impresión DTF: cada píxel del arte final queda 100% opaco o 100% transparente.</div>
        {hardEdges && (
          <label className="block mt-3">
            <span className={labelCls}>Umbral de opacidad: {hardEdgeThreshold}</span>
            <input type="range" min="1" max="254" value={hardEdgeThreshold} onChange={(e) => setHardEdgeThreshold(+e.target.value)} className={rangeCls} />
          </label>
        )}
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
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-[11px] text-white/40 uppercase tracking-widest">Zoom</span>
              {[100, 200, 400].map((z) => (
                <button key={z} onClick={() => setZoom(z)}
                  className={`px-2.5 py-1 rounded text-[11px] font-display ${zoom === z ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>{z}%</button>
              ))}
              <button onClick={() => setCompareMode((v) => !v)}
                className={`ml-2 px-2.5 py-1 rounded text-[11px] font-display uppercase tracking-widest ${compareMode ? 'bg-white/90 text-black' : 'nx-btn-ghost'}`}>Antes/Después</button>
              {compareMode && (
                <input type="range" min="0" max="100" value={comparePos} onChange={(e) => setComparePos(+e.target.value)} className={rangeCls + ' w-32'} />
              )}
            </div>
            <div className="nx-checker rounded-lg overflow-auto flex-1 min-h-[400px] p-2 flex items-center justify-center relative">
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><Loader2 className="animate-spin text-[#00AEEF]" size={28}/></div>}
              {picking && <div className="absolute top-2 left-2 z-10 px-3 py-1.5 rounded bg-[#00F0FF] text-black text-xs font-display uppercase tracking-widest">Haz clic en la imagen para tomar el color</div>}
              <div className="relative" style={zoom !== 100 ? { width: meta ? meta.w * (zoom / 100) : undefined, height: meta ? meta.h * (zoom / 100) : undefined } : undefined}>
                <canvas ref={canvasRef} onClick={handleCanvasClick} className={zoom === 100 ? 'max-w-full max-h-full block' : 'block w-full h-full'} style={{ cursor: picking ? 'crosshair' : 'default' }} />
                {compareMode && originalUrl && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ clipPath: `inset(0 ${100 - comparePos}% 0 0)` }}>
                    <img src={originalUrl} alt="original" className="w-full h-full object-contain" />
                    <div className="absolute top-0 bottom-0 w-px bg-[#00F0FF]" style={{ left: '100%' }} />
                  </div>
                )}
              </div>
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
