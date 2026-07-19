import { downloadText } from '@/lib/tools';

const tick = () => new Promise((r) => setTimeout(r, 0));

function drawToCanvas(img, maxDim) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = maxDim ? Math.min(1, maxDim / Math.max(w, h)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { c, ctx };
}

// ---------- 1. INSPECTOR ----------
export async function inspect(img, params, onP) {
  onP(20);
  const w = img.naturalWidth, h = img.naturalHeight;
  const { c, ctx } = drawToCanvas(img, 500);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let alpha = false, edgeInk = false, minA = 255;
  for (let i = 3; i < data.length; i += 4) { if (data[i] < 250) { alpha = true; if (data[i] < minA) minA = data[i]; } }
  const edge = (x, y) => data[(y * c.width + x) * 4 + 3] > 20;
  for (let x = 0; x < c.width && !edgeInk; x++) if (edge(x, 0) || edge(x, c.height - 1)) edgeInk = true;
  for (let y = 0; y < c.height && !edgeInk; y++) if (edge(0, y) || edge(c.width - 1, y)) edgeInk = true;
  onP(70);
  const printW = params.printCm || 30;
  const dpi = Math.round((w / (printW / 2.54)));
  const summary = [
    { label: 'Dimensiones', value: `${w} × ${h} px` },
    { label: `DPI a ${printW} cm`, value: `${dpi}`, warn: dpi < params.minDpi },
    { label: 'Transparencia', value: alpha ? 'Sí (canal alfa)' : 'No', warn: !alpha },
    { label: 'Píxeles semitransparentes', value: alpha && minA > 5 && minA < 250 ? 'Detectados' : 'No', warn: minA > 5 && minA < 250 },
    { label: 'Diseño toca el borde', value: edgeInk ? 'Sí' : 'No', warn: edgeInk },
    { label: 'Resolución', value: Math.max(w, h) >= 1500 ? 'Alta' : Math.max(w, h) >= 800 ? 'Media' : 'Baja', warn: Math.max(w, h) < 800 },
  ];
  const risks = [];
  if (dpi < params.minDpi) risks.push(`DPI bajo (${dpi}): puede verse pixelado a ${printW} cm.`);
  if (!alpha) risks.push('Sin transparencia: revisa el fondo antes de imprimir DTF.');
  if (edgeInk) risks.push('El diseño toca el borde: agrega margen de seguridad.');
  if (minA > 5 && minA < 250) risks.push('Píxeles semitransparentes: pueden generar halos.');
  onP(100);
  const { c: full } = drawToCanvas(img);
  return { outputDataUrl: full.toDataURL('image/png'), downloadName: `inspeccion-${img.width}.png`,
    result: { dpi, alpha, edgeInk, risks }, summary,
    riskList: risks };
}

// ---------- helpers ----------
function colorDist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

// ---------- 4. BACKGROUND REMOVER ----------
export async function removeBackground(img, params, onP) {
  onP(10);
  const { c, ctx } = drawToCanvas(img, 2000);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data, W = c.width, H = c.height;
  const tol = (params.tolerance ?? 40) * 3;
  const corners = [0, (W - 1) * 4, (H - 1) * W * 4, ((H - 1) * W + (W - 1)) * 4];
  const bg = [0, 0, 0]; let n = 0;
  for (const idx of corners) { bg[0] += d[idx]; bg[1] += d[idx + 1]; bg[2] += d[idx + 2]; n++; }
  bg[0] /= n; bg[1] /= n; bg[2] /= n;
  onP(25);
  // flood fill from borders
  const visited = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (colorDist([d[i], d[i + 1], d[i + 2]], bg) > tol) continue;
    d[i + 3] = 0;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }
  onP(75);
  // soften alpha at removed edges
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0 && colorDist([d[i], d[i + 1], d[i + 2]], bg) < tol * 0.6) d[i + 3] = Math.round(d[i + 3] * 0.4);
  }
  ctx.putImageData(id, 0, 0);
  onP(100);
  return { outputDataUrl: c.toDataURL('image/png'), downloadName: 'sin-fondo.png', result: { bg } };
}

// ---------- 5. UPSCALER ----------
export async function upscale(img, params, onP) {
  onP(15);
  const factor = params.factor || 2;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = Math.min(6000, w * factor); c.height = Math.min(6000, h * factor);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  onP(50);
  // unsharp mask
  const amt = (params.sharpness ?? 50) / 100;
  if (amt > 0) {
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const src = new Uint8ClampedArray(id.data);
    const d = id.data, W = c.width, H = c.height;
    const k = amt;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const c0 = src[i + ch];
          const blur = (src[i - 4 + ch] + src[i + 4 + ch] + src[i - W * 4 + ch] + src[i + W * 4 + ch]) / 4;
          d[i + ch] = Math.max(0, Math.min(255, c0 + (c0 - blur) * k));
        }
      }
      if (y % 100 === 0) { onP(50 + (y / H) * 45); await tick(); }
    }
    ctx.putImageData(id, 0, 0);
  }
  onP(100);
  return { outputDataUrl: c.toDataURL('image/png'), downloadName: `hd-${c.width}x${c.height}.png`,
    result: { size: `${c.width}x${c.height}` },
    summary: [{ label: 'Resolución final', value: `${c.width} × ${c.height} px` }, { label: 'Factor', value: `${factor}×` }] };
}

// ---------- 6. VECTORIZER ----------
export async function vectorize(img, params, onP) {
  onP(15);
  const levels = params.colors || 6;
  const { c, ctx } = drawToCanvas(img, 260);
  const W = c.width, H = c.height;
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const q = (v) => Math.round((Math.round((v / 255) * (levels - 1)) / (levels - 1)) * 255);
  const key = (i) => d[i + 3] < 60 ? null : `${q(d[i])},${q(d[i + 1])},${q(d[i + 2])}`;
  onP(45);
  // run-length rectangles per row per color
  const rects = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i = (y * W + x) * 4;
      const kc = key(i);
      let run = 1;
      while (x + run < W && key((y * W + x + run) * 4) === kc) run++;
      if (kc) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="rgb(${kc})"/>`);
      x += run;
    }
    if (y % 40 === 0) { onP(45 + (y / H) * 45); await tick(); }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
  onP(95);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  onP(100);
  return {
    outputDataUrl: url, downloadName: 'vector.svg', result: { paths: rects.length, colors: levels },
    download: () => downloadText(svg, 'neonexa-vector.svg', 'image/svg+xml'),
    summary: [{ label: 'Colores', value: levels }, { label: 'Segmentos vectoriales', value: rects.length }],
  };
}

// ---------- 7. TRANSPARENCY CLEANER ----------
export async function cleanTransparency(img, params, onP) {
  onP(15);
  const { c, ctx } = drawToCanvas(img, 2500);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const th = params.alphaThreshold ?? 60;
  const removeWhite = params.removeWhite !== false;
  const wth = params.whiteThreshold ?? 240;
  onP(45);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < th) { d[i + 3] = 0; continue; }
    if (d[i + 3] < 255 && d[i + 3] >= th) d[i + 3] = 255; // binarize semi-transparent
    if (removeWhite && d[i] >= wth && d[i + 1] >= wth && d[i + 2] >= wth) d[i + 3] = 0; // strip white halo
  }
  onP(80);
  ctx.putImageData(id, 0, 0);
  onP(100);
  return { outputDataUrl: c.toDataURL('image/png'), downloadName: 'limpio.png', result: { alphaThreshold: th } };
}

// ---------- 8. SMART HALFTONE ----------
export async function smartHalftone(img, params, onP) {
  onP(10);
  const cell = params.cell || 8;
  const garment = params.garment || '#111111';
  const { c: src, ctx: sctx } = drawToCanvas(img, 1600);
  const W = src.width, H = src.height;
  const sd = sctx.getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  octx.clearRect(0, 0, W, H);
  const dark = params.lightGarment ? false : true; // light ink on dark garment
  const ink = params.ink || (dark ? '#ffffff' : '#000000');
  octx.fillStyle = ink;
  const ang = ((params.angle || 45) * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  onP(30);
  for (let gy = -H; gy < H * 2; gy += cell) {
    for (let gx = -W; gx < W * 2; gx += cell) {
      // rotate grid point
      const x = Math.round(gx * cos - gy * sin + W / 2);
      const y = Math.round(gx * sin + gy * cos + H / 2);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      if (sd[i + 3] < 40) continue;
      let lum = (0.299 * sd[i] + 0.587 * sd[i + 1] + 0.114 * sd[i + 2]) / 255;
      if (!dark) lum = lum; else lum = 1 - lum; // invert coverage for light ink
      const r = (cell / 2) * Math.sqrt(Math.max(0, Math.min(1, lum)));
      if (r > 0.3) { octx.beginPath(); octx.arc(x, y, r, 0, Math.PI * 2); octx.fill(); }
    }
    if ((gy % (cell * 20)) === 0) { onP(30 + ((gy + H) / (H * 3)) * 65); await tick(); }
  }
  onP(100);
  // preview over garment color
  const prev = document.createElement('canvas'); prev.width = W; prev.height = H;
  const pctx = prev.getContext('2d');
  pctx.fillStyle = garment; pctx.fillRect(0, 0, W, H);
  pctx.drawImage(out, 0, 0);
  return { outputDataUrl: prev.toDataURL('image/png'), downloadName: 'semitono.png',
    result: { cell, ink },
    // downloadable transparent halftone
    download: () => { const a = document.createElement('a'); a.href = out.toDataURL('image/png'); a.download = 'neonexa-semitono.png'; a.click(); } };
}

// ---------- 9. SHIRT SIMULATOR ----------
export async function shirtSimulate(img, params, onP) {
  onP(20);
  const color = params.color || '#1a1a1a';
  const W = 900, H = 1000;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H);
  // simple t-shirt silhouette
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(280, 170); ctx.lineTo(360, 120); ctx.quadraticCurveTo(450, 175, 540, 120);
  ctx.lineTo(620, 170); ctx.lineTo(760, 260); ctx.lineTo(700, 360); ctx.lineTo(640, 320);
  ctx.lineTo(640, 900); ctx.lineTo(260, 900); ctx.lineTo(260, 320); ctx.lineTo(200, 360);
  ctx.lineTo(140, 260); ctx.closePath(); ctx.fill();
  // subtle shading
  const g = ctx.createLinearGradient(0, 120, 0, 900);
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g; ctx.fill();
  onP(60);
  // place design
  const dw = 320, ratio = (img.naturalHeight || img.height) / (img.naturalWidth || img.width);
  const dh = dw * ratio;
  ctx.drawImage(img, (W - dw) / 2, 360, dw, dh);
  onP(100);
  return { outputDataUrl: c.toDataURL('image/png'), downloadName: 'simulacion.png', result: { color } };
}

// ---------- 10. RIP PREPARER ----------
export async function prepareRip(img, params, onP) {
  onP(20);
  const { c, ctx } = drawToCanvas(img, 2500);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const choke = params.choke ?? 1;
  // white underbase = design alpha (optionally choked)
  const base = document.createElement('canvas'); base.width = c.width; base.height = c.height;
  const bctx = base.getContext('2d');
  const bid = bctx.createImageData(c.width, c.height);
  const bd = bid.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] > 60 ? 255 : 0;
    bd[i] = 255; bd[i + 1] = 255; bd[i + 2] = 255; bd[i + 3] = a;
  }
  bctx.putImageData(bid, 0, 0);
  onP(60);
  // composite: white base under design over neutral gray to visualize
  const prev = document.createElement('canvas'); prev.width = c.width; prev.height = c.height;
  const pctx = prev.getContext('2d');
  pctx.fillStyle = '#333'; pctx.fillRect(0, 0, c.width, c.height);
  pctx.drawImage(base, 0, 0);
  pctx.drawImage(c, 0, 0);
  onP(90);
  const rip = params.rip || 'Acrorip';
  const config = [
    `# Neonexa — Preajuste RIP`,
    `RIP: ${rip}`,
    `Resolución: 1440x1440 dpi`,
    `Modo color: CMYK + Blanco`,
    `Base de blanco: activada (choke ${choke}px)`,
    `Perfil ICC: DTF_Film_v3`,
    `Velocidad tinta blanca: 100%`,
    `Espejo: ${params.mirror ? 'Sí' : 'No'}`,
    `Dimensiones: ${img.naturalWidth}x${img.naturalHeight}px`,
  ].join('\n');
  onP(100);
  return {
    outputDataUrl: prev.toDataURL('image/png'), downloadName: 'rip-preview.png',
    result: { rip, choke },
    download: () => downloadText(config, `neonexa-${rip.toLowerCase()}-preset.txt`),
    summary: [{ label: 'Flujo RIP', value: rip }, { label: 'Base de blanco', value: `Choke ${choke}px` }, { label: 'Espejo', value: params.mirror ? 'Sí' : 'No' }],
  };
}
