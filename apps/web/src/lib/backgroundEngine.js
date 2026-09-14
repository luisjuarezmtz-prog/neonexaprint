/*!
 * Neonexa Quitar Fondo Exterior — motor de recorte por región conectada.
 *
 * Portado del módulo independiente Neonexa-Quitar-Fondo-Standalone-v1.0,
 * autorizado por el cliente. Mismas fórmulas, expandido a forma legible y
 * convertido en módulo ES. No cambiar las constantes (el 2.2 del límite de
 * tolerancia, el piso de alfa 0.08, el umbral de recorte 2).
 *
 * REGLA PROTEGIDA: solo se elimina el fondo que toca el perímetro de la
 * imagen. Un negro, un blanco o un hueco del mismo color que el fondo, si
 * está encerrado dentro del diseño, nunca se borra — el relleno por
 * inundación no puede alcanzarlo.
 */

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexRgb(hex) {
  return hex.match(/[\da-f]{2}/gi).map((x) => parseInt(x, 16));
}

/** Dibuja la imagen a un canvas a resolución completa (sin reescalar). */
export function toCanvas(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const c = makeCanvas(w, h);
  c.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0);
  return c;
}

/**
 * Color de fondo sugerido: promedio de las cuatro esquinas. Es la semilla
 * que el usuario puede corregir a mano si la imagen tiene una esquina atípica.
 */
export function detectBackgroundColor(image) {
  const c = toCanvas(image);
  const w = c.width, h = c.height;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let r = 0, g = 0, b = 0;
  corners.forEach(([x, y]) => {
    const i = (y * w + x) * 4;
    r += d[i] / 4; g += d[i + 1] / 4; b += d[i + 2] / 4;
  });
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/**
 * Quita el fondo conectado al borde y descontamina el halo.
 *
 * @param {number} tolerance  3–100; el límite real de distancia es tolerance*2.2
 * @param {number} decontaminate 0–100; fuerza del des-mezclado en los bordes
 * @returns {{canvas: HTMLCanvasElement, removed: number, remaining: number}}
 */
export function removeOuterBackground(image, { backgroundColor, tolerance = 28, decontaminate = 70 } = {}) {
  const canvas = toCanvas(image);
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const frame = ctx.getImageData(0, 0, w, h);
  const d = frame.data;
  const total = w * h;

  const rgb = hexRgb(backgroundColor || detectBackgroundColor(image));
  const limit = tolerance * 2.2;

  let opaqueBefore = 0;
  for (let p = 0; p < total; p++) if (d[p * 4 + 3] > 2) opaqueBefore++;

  // --- relleno por inundación sembrado en todo el perímetro ---
  const seen = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0, tail = 0;

  const eligible = (p) => {
    const i = p * 4;
    // Un píxel ya transparente se atraviesa, para que el fondo siga fluyendo
    // por zonas con alfa que vienen del PNG original.
    return d[i + 3] < 3 || Math.hypot(d[i] - rgb[0], d[i + 1] - rgb[1], d[i + 2] - rgb[2]) <= limit;
  };
  const add = (p) => { if (!seen[p] && eligible(p)) { seen[p] = 1; queue[tail++] = p; } };

  for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { add(y * w); add(y * w + w - 1); }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w, y = Math.floor(p / w);
    d[p * 4 + 3] = 0;
    if (x) add(p - 1);
    if (x + 1 < w) add(p + 1);
    if (y) add(p - w);
    if (y + 1 < h) add(p + w);
  }

  // --- descontaminación del halo ---
  // Un píxel del contorno es una mezcla entre el diseño y el fondo. Conocido
  // el color del fondo y el alfa, se le resta la parte proporcional de fondo
  // para recuperar el color real del diseño, en vez de dejar el orillo teñido.
  const strength = decontaminate / 100;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x, i = p * 4;
      if (!d[i + 3]) continue;
      let exposed = 0;
      [p - 1, p + 1, p - w, p + w].forEach((q) => { if (!d[q * 4 + 3]) exposed++; });
      if (!exposed) continue;
      const a = Math.max(d[i + 3] / 255, 0.08);
      const factor = (exposed / 4) * strength;
      d[i] = clamp((d[i] - rgb[0] * (1 - a) * factor) / a);
      d[i + 1] = clamp((d[i + 1] - rgb[1] * (1 - a) * factor) / a);
      d[i + 2] = clamp((d[i + 2] - rgb[2] * (1 - a) * factor) / a);
    }
  }

  ctx.putImageData(frame, 0, 0);

  let opaqueAfter = 0;
  for (let p = 0; p < total; p++) if (d[p * 4 + 3] > 2) opaqueAfter++;

  return {
    canvas,
    removed: Math.round(((opaqueBefore - opaqueAfter) / Math.max(1, total)) * 100),
    remaining: Math.round((opaqueAfter / Math.max(1, total)) * 100),
  };
}

/** Recorta el lienzo al rectángulo que realmente ocupa el diseño. */
export function trimCanvas(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let l = w, t = h, r = 0, b = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 2) {
        if (x < l) l = x;
        if (y < t) t = y;
        if (x + 1 > r) r = x + 1;
        if (y + 1 > b) b = y + 1;
      }
    }
  }
  if (!(r > l && b > t)) return canvas; // todo transparente: no hay qué recortar
  const out = makeCanvas(r - l, b - t);
  out.getContext('2d').drawImage(canvas, l, t, r - l, b - t, 0, 0, r - l, b - t);
  return out;
}
