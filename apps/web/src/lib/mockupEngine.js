// Ported faithfully from the client-approved reference implementation
// (Nuevos modulos/Neonexa-Mockups-Standalone-v1.0/app.js) — same products,
// same recolor curve, same flood-fill background removal and the same
// composition math, restructured as an ES module instead of inline DOM code.
// Do not change the formulas: the preview and the exported PNG both derive
// their geometry from composeMockup(), so they stay pixel-identical.

// Every product bitmap is square; the stage and the export both place it as a
// centered square, which is what keeps the on-screen preview honest.
export const PRODUCTS = {
  'shirt-front':  { label: 'Playera · Frente',   src: '/mockups/shirt.png',                  x: 50, y: 45, scale: 34, tint: true },
  'shirt-back':   { label: 'Playera · Espalda',  src: '/mockups/shirt-back.png',             x: 50, y: 45, scale: 34, tint: true },
  'hoodie-front': { label: 'Sudadera · Frente',  src: '/mockups/hoodie-front-no-cords.png',  x: 50, y: 46, scale: 30, tint: true },
  'hoodie-back':  { label: 'Sudadera · Espalda', src: '/mockups/hoodie-back.png',            x: 50, y: 47, scale: 30, tint: true },
  mug:            { label: 'Taza',               src: '/mockups/mug.png',                    x: 38, y: 51, scale: 34, tint: false },
};

export const FORMATS = {
  square:   { label: 'Cuadrado · 1600×1600', w: 1600, h: 1600 },
  portrait: { label: 'Retrato · 1600×2000',  w: 1600, h: 2000 },
  story:    { label: 'Historia · 1080×1920', w: 1080, h: 1920 },
};

export const GARMENT_COLORS = ['#111318', '#f4f4f1', '#8f949d', '#b91f2e', '#182d58', '#2255a4', '#18705b'];

// The product bitmaps are already shot on a near-black garment, so this exact
// value means "leave the original pixels alone" rather than re-tinting them.
export const NATIVE_GARMENT = '#111318';

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * Re-tints a garment to `hex` while preserving its lighting: every pixel keeps
 * its own luminance, which is turned into a multiplier over the target colour,
 * so folds, seams and shadows survive the colour change.
 * Returns a data URL, or the untouched source when no tint applies.
 */
export async function recolorGarment(product, hex) {
  if (!product.tint || hex === NATIVE_GARMENT) return product.src;
  const image = await loadImage(product.src);
  const c = makeCanvas(image.naturalWidth, image.naturalHeight);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, c.width, c.height);
  const d = frame.data;
  const [r, g, b] = hexRgb(hex);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 2) continue;
    const l = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255;
    const s = Math.max(0.42, Math.min(1.08, 0.52 + l * 2.15));
    d[i] = Math.min(255, r * s);
    d[i + 1] = Math.min(255, g * s);
    d[i + 2] = Math.min(255, b * s);
  }
  ctx.putImageData(frame, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Clears only the background that touches the image border: the fill is seeded
 * from every edge pixel and stops at the first pixel further than 28 from the
 * averaged corner colour, so a same-coloured area enclosed inside the artwork
 * is never punched out.
 */
export function removeConnectedBackground(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  const target = [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + d[i + k], 0) / 4);
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let px = 0; px < w; px++) stack.push(px, (h - 1) * w + px);
  for (let py = 0; py < h; py++) stack.push(py * w, py * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    const dist = Math.hypot(d[i] - target[0], d[i + 1] - target[1], d[i + 2] - target[2]);
    if (dist > 28) continue;
    d[i + 3] = 0;
    const xx = p % w, yy = (p / w) | 0;
    if (xx) stack.push(p - 1);
    if (xx < w - 1) stack.push(p + 1);
    if (yy) stack.push(p - w);
    if (yy < h - 1) stack.push(p + w);
  }
  ctx.putImageData(frame, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Geometry shared by the live preview and the export, expressed as fractions of
 * the centered square so both render the identical composition.
 */
export function layout({ product, scale, offsetX, offsetY }) {
  return {
    width: scale,                      // % of the square's side
    left: product.x + offsetX,         // % of the square's side
    top: product.y + offsetY,          // % of the square's side
  };
}

/** Renders the final mockup and resolves to a PNG blob. */
export async function composeMockup({ baseSrc, designSrc, product, format, background, scale, offsetX, offsetY, rotation, opacity }) {
  const { w, h } = FORMATS[format];
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const [base, design] = await Promise.all([loadImage(baseSrc), loadImage(designSrc)]);

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  const size = Math.min(w, h);
  const bx = (w - size) / 2;
  const by = (h - size) / 2;
  ctx.drawImage(base, bx, by, size, size);

  const place = layout({ product, scale, offsetX, offsetY });
  const dw = size * place.width / 100;
  const dh = dw * (design.naturalHeight / design.naturalWidth);
  const cx = bx + size * place.left / 100;
  const cy = by + size * place.top / 100;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.globalAlpha = opacity / 100;
  ctx.drawImage(design, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
