// Ported faithfully from the client-approved reference implementation
// (Neonexa-Halftone-Final-v1.0/halftone-engine.js) — same math, restructured
// as an ES module instead of a window-global IIFE. Do not change the formulas.

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
// pixel against the target garment color. For saturated/bright ("family")
// garment colors, removal is hue-based (removes the whole color family, not
// just the exact hex); otherwise it's a direct weighted-distance match.
function colorKeep(r, g, b, tr, tg, tb, tolerance, family) {
  const [, ts] = hsv(tr, tg, tb);
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

  const [, sat, val] = hsv(tr, tg, tb), family = sat > 0.18 && val > 0.28;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const keep = colorKeep(data[i], data[i + 1], data[i + 2], tr, tg, tb, s.tolerance, family);
    data[i + 3] = Math.round(data[i + 3] * keep);
  }
  cleanEdges(data, before, [tr, tg, tb]);

  if (!family) {
    const cell = Math.max(2, (s.dpi / s.lpi) * scale);
    const dotScale = clamp(0.48 + s.size / 15, 0.5, 1.22);
    const maxDot = Math.max(1, Math.min(cell * 0.92, cell - s.gap * 0.08)) * dotScale;
    const minDot = Math.min(maxDot, 1.5 * scale);
    const rad = s.angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const cx = w / 2, cy = h / 2, diag = Math.ceil(Math.hypot(w, h)), start = -diag / 2;
    for (let gy = start; gy <= diag / 2; gy += cell) {
      for (let gx = start; gx <= diag / 2; gx += cell) {
        const x = cx + gx * cos - gy * sin, y = cy + gx * sin + gy * cos;
        const sx = Math.round(x), sy = Math.round(y);
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        let lum = 0, aSum = 0, n = 0;
        const sr = Math.max(1, Math.floor(cell * 0.3));
        for (let yy = Math.max(0, sy - sr); yy <= Math.min(h - 1, sy + sr); yy += sr) {
          for (let xx = Math.max(0, sx - sr); xx <= Math.min(w - 1, sx + sr); xx += sr) {
            const p = (yy * w + xx) * 4, a = data[p + 3] / 255;
            if (a < 0.02) continue;
            lum += ((data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255) * a;
            aSum += a; n++;
          }
        }
        if (!n || aSum < 0.08) continue;
        lum = clamp((lum / aSum - 0.5) * (1 + s.contrast / 50) + 0.5 + s.brightness / 100, 0, 1);
        const dark = (tr * 0.299 + tg * 0.587 + tb * 0.114) < 145;
        const tonal = dark ? 1 - lum : lum;
        const relief = 0.12 + 0.78 * Math.pow(clamp(tonal, 0, 1), 1 / 1.55);
        const diameter = minDot + (maxDot - minDot) * Math.sqrt(relief);
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
