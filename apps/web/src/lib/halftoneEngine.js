// Ported faithfully from the client-approved reference implementation
// (Neonexa-Halftone-Portal-Sync-v2.0/halftone-engine.js) — same math,
// restructured as an ES module instead of a window-global IIFE.
// Do not change the formulas.

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

function hexRgb(hex) {
  const v = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max ? d / max : 0, max];
}

// Weighted RGB distance (redmean-style), tuned per channel by the mean red level.
function distance(r, g, b, tr, tg, tb) {
  const rm = (r + tr) / 2, dr = r - tr, dg = g - tg, db = b - tb;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 2;
}

// Returns the alpha-keep multiplier (0 = fully removed, 1 = fully kept) for a
// pixel against the target garment color.
//  - Near-black, low-saturation targets (a "black" garment swatch) use a
//    dedicated neutral-dark removal: strips dark + fairly unsaturated pixels
//    without the hue-matching logic below, which doesn't apply to neutrals.
//  - Saturated/bright ("family") garment colors remove by hue match (the
//    whole color family, not just the exact hex).
//  - Otherwise (light neutral, e.g. white) it's a direct weighted-distance match.
function colorKeep(r, g, b, tr, tg, tb, tolerance, family) {
  const [, ts, tv] = hsv(tr, tg, tb);
  if (tv < 0.18 && ts < 0.32) {
    const [, s, v] = hsv(r, g, b);
    const n = clamp(tolerance / 80, 0, 1);
    const core = 0.055 + n * 0.105, outer = 0.14 + n * 0.19;
    const start = 0.22 + n * 0.08;
    const neutral = 1 - smooth(start, Math.min(0.72, start + 0.28), s);
    const remove = (1 - smooth(core, outer, v)) * neutral;
    return 1 - remove;
  }
  if (family && ts > 0.18) {
    const [h, s, v] = hsv(r, g, b), [th] = hsv(tr, tg, tb);
    const hd = Math.min(Math.abs(h - th), 360 - Math.abs(h - th));
    const core = 2 + tolerance * 0.08, outer = core + 3 + tolerance * 0.1;
    const hr = 1 - smooth(core, outer, hd);
    const cr = smooth(Math.max(0.34, ts * 0.48), Math.max(0.62, ts * 0.78), s);
    const visible = smooth(0.25, 0.42, v);
    return 1 - hr * cr * visible;
  }
  const d = distance(r, g, b, tr, tg, tb);
  const low = Math.max(2, tolerance * 0.72), high = Math.max(low + 1, tolerance * 2.35);
  return smooth(low, high, d);
}

function alphaSnapshot(data) {
  const a = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) a[p] = data[i + 3];
  return a;
}

// Un-mixes residual background color bleed from semi-transparent edge pixels
// (halo/fringe cleanup for a clean cutout).
function cleanEdges(data, before, bg) {
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const old = before[p], now = data[i + 3];
    if (old < 4 || now < 4 || now >= old - 1) continue;
    const c = clamp(now / old, 0.16, 1), inv = 1 - c;
    data[i] = clamp(Math.round((data[i] - bg[0] * inv) / c), 0, 255);
    data[i + 1] = clamp(Math.round((data[i + 1] - bg[1] * inv) / c), 0, 255);
    data[i + 2] = clamp(Math.round((data[i + 2] - bg[2] * inv) / c), 0, 255);
  }
}

// Flood-fills transparency starting from the image border, through pixels
// connected to it that match the target background color within tolerance —
// removes a photo-style background without touching same-colored regions
// deep inside the artwork that aren't connected to the edge.
function removeConnectedBackground(data, w, h, target, tolerance) {
  const total = w * h;
  const visited = new Uint8Array(total), queue = new Uint32Array(total);
  const [tr, tg, tb] = target;
  const limit = Math.max(3, tolerance * 2.2);
  let head = 0, tail = 0;
  const eligible = (p) => {
    const i = p * 4;
    return data[i + 3] > 2 && distance(data[i], data[i + 1], data[i + 2], tr, tg, tb) <= limit;
  };
  const add = (p) => { if (!visited[p] && eligible(p)) { visited[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { add(y * w); add(y * w + w - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % w;
    if (p >= w) add(p - w);
    if (p < total - w) add(p + w);
    if (x) add(p - 1);
    if (x < w - 1) add(p + 1);
  }
  const feather = Math.max(2, limit * 0.38);
  for (let p = 0; p < total; p++) {
    if (visited[p]) {
      const i = p * 4;
      const d = distance(data[i], data[i + 1], data[i + 2], tr, tg, tb);
      data[i + 3] = Math.round(data[i + 3] * smooth(limit - feather, limit, d));
    }
  }
}

// Reduces alpha in a dot/square/diamond/hexagon/line shape at (cx,cy) — this
// "punches" a hole of transparency into the still-full-color image, instead
// of drawing new ink; a signed-distance field per shape gives an antialiased edge.
function punch(data, w, h, cx, cy, diameter, pattern, angle) {
  const radius = diameter / 2, bound = Math.ceil(radius + 1);
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  const x0 = Math.max(0, Math.floor(cx - bound)), x1 = Math.min(w - 1, Math.ceil(cx + bound));
  const y0 = Math.max(0, Math.floor(cy - bound)), y1 = Math.min(h - 1, Math.ceil(cy + bound));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
      let signed;
      if (pattern === 'circle') signed = Math.hypot(rx, ry) - radius;
      else if (pattern === 'square') signed = Math.max(Math.abs(rx), Math.abs(ry)) - radius;
      else if (pattern === 'diamond') signed = (Math.abs(rx) + Math.abs(ry)) / Math.SQRT2 - radius;
      else if (pattern === 'hexagon') signed = Math.max(Math.abs(rx) * 0.866 + Math.abs(ry) * 0.5, Math.abs(ry)) - radius;
      else signed = Math.max(Math.abs(rx) - radius, Math.abs(ry) - Math.max(0.6, radius * 0.28));
      if (signed >= 0.75) continue;
      const keep = clamp(signed + 0.75, 0, 1), i = (y * w + x) * 4 + 3;
      data[i] = Math.round(data[i] * keep);
    }
  }
}

export async function process(image, s) {
  const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
  const maxPixels = 36000000, scale = Math.min(1, Math.sqrt(maxPixels / (sw * sh)));
  const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = w; canvas.height = h;
  ctx.drawImage(image, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h), data = pixels.data;
  const [tr, tg, tb] = hexRgb(s.garmentColor);
  const before = alphaSnapshot(data);
  let originalAlpha = 0;
  for (let i = 0; i < data.length; i += 4) originalAlpha += data[i + 3];

  const [, targetSat, targetValue] = hsv(tr, tg, tb);
  const family = targetSat > 0.18 && targetValue > 0.28;
  const garment = family ? 'color' : ((tr * 0.299 + tg * 0.587 + tb * 0.114) < 145 ? 'dark' : 'light');

  if (s.removeBackground && garment !== 'color') {
    const bg = hexRgb(s.backgroundColor || '#111111');
    const bgBefore = alphaSnapshot(data);
    removeConnectedBackground(data, w, h, bg, s.backgroundTolerance || 34);
    cleanEdges(data, bgBefore, bg);
  }

  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const keep = colorKeep(data[i], data[i + 1], data[i + 2], tr, tg, tb, s.tolerance, true);
    data[i + 3] = Math.round(data[i + 3] * keep);
  }
  cleanEdges(data, before, [tr, tg, tb]);

  const cell = Math.max(2, (s.dpi / s.lpi) * scale);
  const dotScale = clamp(0.48 + s.size / 15, 0.5, 1.22);
  const maxDot = Math.max(1, Math.min(cell * 0.92, cell - s.gap * 0.08)) * dotScale;
  const minDot = Math.min(maxDot, (s.minSize || 1) * scale);
  const rad = s.angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = w / 2, cy = h / 2, diag = Math.ceil(Math.hypot(w, h)), start = -diag / 2;

  if (garment !== 'color') {
    for (let gy = start; gy <= diag / 2; gy += cell) {
      for (let gx = start; gx <= diag / 2; gx += cell) {
        const x = cx + gx * cos - gy * sin, y = cy + gx * sin + gy * cos;
        const sx = Math.round(x), sy = Math.round(y);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        let lum = 0, aSum = 0, n = 0, dSum = 0;
        const sr = Math.max(1, Math.floor(cell * 0.3));
        for (let yy = Math.max(0, sy - sr); yy <= Math.min(h - 1, sy + sr); yy += sr) {
          for (let xx = Math.max(0, sx - sr); xx <= Math.min(w - 1, sx + sr); xx += sr) {
            const p = (yy * w + xx) * 4, a = data[p + 3] / 255;
            if (a < 0.02) continue;
            lum += ((data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255) * a;
            dSum += distance(data[p], data[p + 1], data[p + 2], tr, tg, tb) * a;
            aSum += a; n++;
          }
        }
        if (!n || aSum < 0.08) continue;
        lum = clamp((lum / aSum - 0.5) * (1 + s.contrast / 50) + 0.5 + s.brightness / 100, 0, 1);
        const tonal = garment === 'dark' ? 1 - lum : lum;
        const curved = Math.pow(clamp(tonal, 0, 1), 1 / ((s.gamma || 180) / 100));
        const relief = ((s.minDensity || 10) + ((s.maxDensity || 88) - (s.minDensity || 10)) * curved) / 100;
        const avgDistance = dSum / aSum;
        // Cells whose color strongly differs from the garment (likely real
        // artwork, not garment-color residue) get their punch scaled down,
        // preserving more of that clearly-intentional content.
        const protectedScale = avgDistance > (s.protectionThreshold || 200) ? 0.58 : 1;
        // Highlight protection: floors relief in the light zone so bright
        // areas keep some visible dot detail instead of going pure dead-flat.
        const ha = (s.highlightProtection || 0) / 100;
        const hStart = 0.62 - ha * 0.27;
        const hp = clamp((lum - hStart) / (1 - hStart), 0, 1), hw = hp * hp * (3 - 2 * hp);
        const hFloor = ha * hw * 0.52;
        const protectedRelief = Math.max(relief, hFloor);
        // Shadow protection: scales down the diameter in the dark zone so
        // shadows don't "close" into solid punched-out fabric and lose the
        // design's own texture underneath.
        const sa = (s.shadowProtection || 0) / 100;
        const sEnd = 0.24 + sa * 0.31;
        const sp = clamp((sEnd - lum) / sEnd, 0, 1), swgt = sp * sp * (3 - 2 * sp);
        const shadowScale = 1 - sa * swgt * 0.48;
        const diameter = (minDot + (maxDot - minDot) * Math.sqrt(protectedRelief)) * protectedScale * shadowScale;
        if (diameter >= 0.65) punch(data, w, h, x, y, diameter, s.pattern, rad);
      }
    }
  }

  let finalAlpha = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] <= 1) data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    finalAlpha += data[i + 3];
  }
  ctx.putImageData(pixels, 0, 0);
  return {
    canvas,
    removed: originalAlpha ? Math.round((1 - finalAlpha / originalAlpha) * 1000) / 10 : 0,
    remaining: originalAlpha ? Math.round((finalAlpha / originalAlpha) * 1000) / 10 : 0,
    width: w, height: h,
  };
}

// Samples a downscaled copy of the uploaded image to auto-derive a tuned
// settings recipe (garment color, density curve, background removal, LPI,
// tolerance, gamma) — so the tool needs zero manual adjustment on upload.
export async function analyzeImage(source) {
  const size = 160;
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = size; canvas.height = size;
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const bins = new Map(), allBins = new Map();
  let gradient = 0, gradientSamples = 0, opaque = 0, dark = 0, transparent = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (data[i + 3] < 250) transparent++;
      if (data[i + 3] < 32) continue;
      opaque++;
      const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (luminance < 45) dark++;
      const allKey = `${data[i] >> 4}-${data[i + 1] >> 4}-${data[i + 2] >> 4}`;
      const allEntry = allBins.get(allKey) || { count: 0, r: 0, g: 0, b: 0 };
      allEntry.count++; allEntry.r += data[i]; allEntry.g += data[i + 1]; allEntry.b += data[i + 2];
      allBins.set(allKey, allEntry);
      if (x < 10 || y < 10 || x >= size - 10 || y >= size - 10) {
        const key = allKey, entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        entry.count++; entry.r += data[i]; entry.g += data[i + 1]; entry.b += data[i + 2];
        bins.set(key, entry);
      }
      if (x && y) {
        const left = i - 4, up = i - size * 4;
        gradient += (Math.abs(data[i] - data[left]) + Math.abs(data[i + 1] - data[left + 1]) + Math.abs(data[i + 2] - data[left + 2])
          + Math.abs(data[i] - data[up]) + Math.abs(data[i + 1] - data[up + 1]) + Math.abs(data[i + 2] - data[up + 2])) / 6;
        gradientSamples++;
      }
    }
  }

  const edgeDominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  const artworkDominant = [...allBins.values()].sort((a, b) => b.count - a.count)[0];
  const dominant = edgeDominant || artworkDominant || { count: 1, r: 255, g: 255, b: 255 };
  const r = Math.round(dominant.r / dominant.count), g = Math.round(dominant.g / dominant.count), b = Math.round(dominant.b / dominant.count);
  const backgroundColor = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const luma = r * 0.299 + g * 0.587 + b * 0.114;
  const detail = gradientSamples ? gradient / gradientSamples : 0;
  const fine = detail > 30, medium = detail > 17;
  const darkArtwork = opaque ? dark / opaque : 0;
  const garmentColor = darkArtwork > 0.35 ? '#111318' : '#ffffff';

  return {
    garmentColor,
    minSize: fine ? 1 : 2,
    gap: fine ? 10 : medium ? 9 : 8,
    minDensity: fine ? 8 : 12,
    maxDensity: garmentColor === '#111318' ? 90 : 82,
    lpi: fine ? 55 : medium ? 45 : 35,
    gamma: fine ? 185 : 155,
    tolerance: garmentColor === '#111318' ? 28 : 22,
    protectionThreshold: 210,
    backgroundColor,
    backgroundTolerance: luma < 35 || luma > 220 ? 34 : 26,
    removeBackground: transparent / size / size < 0.02,
    transparent: transparent > 0,
  };
}
