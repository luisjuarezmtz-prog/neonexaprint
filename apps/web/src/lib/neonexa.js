import pb from '@/lib/pocketbaseClient';

// ---- settings ----
const cache = {};
export async function getSetting(key, fallback) {
  if (cache[key]) return cache[key];
  try {
    const rec = await pb.collection('settings').getFirstListItem(`key="${key}"`);
    cache[key] = rec;
    return rec;
  } catch {
    return fallback ? { key, value: fallback } : null;
  }
}
export function invalidateSetting(key) { delete cache[key]; }

export const DEFAULT_TEXTIL = {
  currency: 'MXN',
  tiers: [ { min: 1, max: 4, price: 200 }, { min: 5, max: 9999, price: 180 } ],
  minMeters: 0.5,
};
export const DEFAULT_UV = {
  currency: 'MXN',
  modes: {
    hoja: { label: 'Por hoja (A3)', unit: 'hoja', price: 85 },
    medida: { label: 'Por medida (m²)', unit: 'm²', price: 950 },
    metro: { label: 'Por metro lineal', unit: 'm', price: 260 },
    proyecto: { label: 'Por proyecto', unit: 'proyecto', price: 500 },
  },
  surcharges: { blanco: 0.15, barniz: 0.20 },
};
export const DEFAULT_UPLOAD = { formats: ['png','jpg','jpeg','pdf','tiff','svg'], maxSizeMB: 50, minDPI: 150 };

// ---- pricing ----
export function textilUnitPrice(cfg, meters) {
  const tiers = cfg?.tiers || DEFAULT_TEXTIL.tiers;
  const t = tiers.find((x) => meters >= x.min && meters <= x.max) || tiers[tiers.length - 1];
  return t.price;
}
export function quoteTextil(cfg, meters, qty) {
  const m = Math.max(Number(meters) || 0, 0);
  const q = Math.max(Number(qty) || 1, 1);
  const unit = textilUnitPrice(cfg, m * q >= 5 ? m * q : m);
  const totalMeters = m * q;
  return { unit, totalMeters, subtotal: +(unit * totalMeters).toFixed(2) };
}
export function quoteUv(cfg, mode, dims) {
  const modes = cfg?.modes || DEFAULT_UV.modes;
  const md = modes[mode] || modes.hoja;
  const qty = Math.max(Number(dims.qty) || 1, 1);
  let base = md.price * qty;
  if (mode === 'medida') base = md.price * (Number(dims.area) || 0) * qty;
  if (mode === 'metro') base = md.price * (Number(dims.meters) || 0) * qty;
  let surcharge = 0;
  const sc = cfg?.surcharges || {};
  if (dims.blanco) surcharge += base * (sc.blanco || 0);
  if (dims.barniz) surcharge += base * (sc.barniz || 0);
  return { base: +base.toFixed(2), surcharge: +surcharge.toFixed(2), subtotal: +(base + surcharge).toFixed(2), unit: md.price, unitLabel: md.unit };
}

export const money = (n, cur = 'MXN') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: cur }).format(Number(n) || 0);

export function makeFolio() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NX-${ymd}-${rnd}`;
}

// ---- image analysis (client-side) ----
export function analyzeImageFile(file) {
  return new Promise((resolve) => {
    const base = {
      name: file.name,
      sizeMB: +(file.size / 1048576).toFixed(2),
      ext: (file.name.split('.').pop() || '').toLowerCase(),
      type: file.type || 'desconocido',
    };
    if (!file.type.startsWith('image/')) {
      resolve({ ...base, width: null, height: null, hasAlpha: null, incidencias: base.ext === 'pdf' ? [] : ['Vista previa no disponible'] });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      let hasAlpha = false, edgeInk = false;
      try {
        const c = document.createElement('canvas');
        const s = Math.min(1, 400 / Math.max(w, h));
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < data.length; i += 4) { if (data[i] < 250) { hasAlpha = true; break; } }
        // check edges for opaque ink touching border
        const checkEdge = (x, y) => data[(y * c.width + x) * 4 + 3] > 20;
        for (let x = 0; x < c.width && !edgeInk; x++) { if (checkEdge(x, 0) || checkEdge(x, c.height - 1)) edgeInk = true; }
      } catch { /* ignore */ }
      // approx DPI assuming print at ~30cm (11.8in) longest side is heuristic; report px only
      const incidencias = [];
      if (Math.max(w, h) < 1000) incidencias.push('Resolución baja: puede verse pixelado en impresión grande');
      if (!hasAlpha && base.ext === 'png') incidencias.push('PNG sin transparencia: revisa el fondo');
      if (edgeInk) incidencias.push('El diseño toca el borde: agrega margen de seguridad');
      const previewUrl = url;
      resolve({ ...base, width: w, height: h, hasAlpha, edgeInk, incidencias, previewUrl });
    };
    img.onerror = () => resolve({ ...base, width: null, height: null, hasAlpha: null, incidencias: ['No se pudo leer la imagen'] });
    img.src = url;
  });
}
