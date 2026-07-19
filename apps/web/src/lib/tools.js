import pb from '@/lib/pocketbaseClient';

export const TOOLS = [
  { slug: 'inspector', name: 'Inspector de impresión', desc: 'Analiza resolución, tamaño, transparencias, bordes y riesgos antes de imprimir.', priority: 1 },
  { slug: 'calculadora', name: 'Calculadora inteligente de costos', desc: 'Calcula metros, material, tinta, mano de obra, merma, margen y precio sugerido.', priority: 1 },
  { slug: 'gang-sheet', name: 'Gang Sheet automático con IA', desc: 'Acomoda diseños para aprovechar el ancho y largo imprimible.', priority: 1 },
  { slug: 'background-remover', name: 'Eliminador de fondo con IA Pro', desc: 'Quita fondos conservando detalle fino y genera PNG transparente.', priority: 2 },
  { slug: 'upscaler', name: 'Mejorador HD/4K para DTF', desc: 'Aumenta resolución y nitidez para impresión.', priority: 2 },
  { slug: 'vectorizer', name: 'Vectorizador IA (PNG → SVG)', desc: 'Convierte raster a vectores editables.', priority: 2 },
  { slug: 'transparency-cleaner', name: 'Eliminador de transparencias y bordes blancos', desc: 'Corrige píxeles semitransparentes, halos y bordes no deseados.', priority: 2 },
  { slug: 'halftone-smart', name: 'Halftone Studio Pro', desc: 'Semitonos profesionales con DPI/LPI, formas de punto, separación CMYK, base blanca con choke y vista sobre prenda.', priority: 2 },
  { slug: 'shirt-simulator', name: 'Simulador sobre playeras', desc: 'Previsualiza el diseño sobre prendas y colores distintos.', priority: 2 },
  { slug: 'rip-preparer', name: 'Preparador automático para RIP', desc: 'Prepara archivos para Acrorip, Maintop, CADlink, Flexi y otros.', priority: 2 },
];

export const toolBySlug = (slug) => TOOLS.find((t) => t.slug === slug);

// ---- image loading helpers ----
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

export function canvasToDataURL(canvas, type = 'image/png', q = 0.92) {
  return canvas.toDataURL(type, q);
}

export function downloadDataURL(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadText(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// small thumbnail data URL for storing previews without blowing size limits
export function makeThumb(img, max = 320) {
  const c = document.createElement('canvas');
  const s = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * s));
  c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  try { return c.toDataURL('image/jpeg', 0.7); } catch { return ''; }
}

// ---- persistence: jobs, usage, errors ----
export async function recordJob({ tool, title, status = 'done', inputName, inputPreview, outputPreview, params, result, error, resultBlob, resultFilename }) {
  const owner = pb.authStore.record?.id;
  if (!owner) return null;
  try {
    // Result files are protected — stored so they're recoverable later via a
    // short-lived token, instead of only ever existing as an in-memory data
    // URL that's gone the moment the tab closes.
    let payload;
    if (resultBlob) {
      payload = new FormData();
      payload.append('tool', tool);
      payload.append('title', title || '');
      payload.append('status', status);
      payload.append('input_name', inputName || '');
      payload.append('input_preview', inputPreview || '');
      payload.append('output_preview', outputPreview || '');
      payload.append('params', JSON.stringify(params || {}));
      payload.append('result', JSON.stringify(result || {}));
      payload.append('error', error || '');
      payload.append('owner', owner);
      payload.append('result_file', resultBlob, resultFilename || 'resultado.png');
    } else {
      payload = {
        tool, title: title || '', status,
        input_name: inputName || '', input_preview: inputPreview || '', output_preview: outputPreview || '',
        params: params || {}, result: result || {}, error: error || '', owner,
      };
    }
    const rec = await pb.collection('tool_jobs').create(payload, { requestKey: `job-${tool}-${Date.now()}` });
    return rec;
  } catch (e) { console.info('recordJob skipped', String(e)); return null; }
}

// data:URL -> Blob, for uploading a canvas/text result as a real protected file
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function getJobResultUrl(job) {
  if (!job.result_file) return null;
  const token = await pb.files.getToken();
  return pb.files.getUrl(job, job.result_file, { token });
}

export async function logUsage(tool, action = 'run', meta = {}) {
  const owner = pb.authStore.record?.id;
  if (!owner) return;
  try { await pb.collection('tool_usage_logs').create({ tool, action, meta, owner }, { requestKey: `usage-${tool}-${Date.now()}` }); }
  catch (e) { console.info('logUsage skipped', String(e)); }
}

export async function logError(tool, err, meta = {}) {
  const owner = pb.authStore.record?.id;
  if (!owner) return;
  try {
    await pb.collection('tool_errors').create({
      tool, message: String(err?.message || err).slice(0, 1900),
      stack: String(err?.stack || '').slice(0, 5900), meta, owner,
    }, { requestKey: `err-${tool}-${Date.now()}` });
  } catch (e) { console.info('logError skipped', String(e)); }
}

// ---- per-plan monthly limit check ----
export async function checkLimit(tool, planName) {
  try {
    const limit = await pb.collection('tool_limits').getFirstListItem(
      pb.filter('tool = {:t} && plan_name = {:p}', { t: tool, p: planName || '' })
    );
    if (limit.enabled === false) return { allowed: false, reason: 'Herramienta no disponible en tu plan.' };
    const max = Number(limit.monthly_limit);
    if (max < 0) return { allowed: true, remaining: -1 };
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    const used = await pb.collection('tool_jobs').getList(1, 1, {
      filter: pb.filter('tool = {:t} && created >= {:d}', { t: tool, d: start.toISOString().replace('T', ' ') }),
    });
    const remaining = Math.max(0, max - used.totalItems);
    return { allowed: remaining > 0, remaining, max };
  } catch { return { allowed: true, remaining: -1 }; }
}
