/*!
 * NEONEXA STUDIO — el proyecto como documento vivo.
 *
 * Un proyecto guarda el original intacto y la lista de pasos que lo llevan a
 * su estado actual. El estado no se reconstruye leyendo un PNG intermedio:
 * se vuelve a correr la cadena de motores sobre el original, que es barato
 * porque todo ocurre en el navegador.
 *
 * Por eso deshacer es solo mover un numero. `step_cursor` dice cuantos pasos
 * estan activos; los que quedan despues siguen guardados, asi que rehacer no
 * cuesta nada y el historial nunca se pierde por equivocarse.
 *
 *   steps:  [fondo] [halftone] [vector]
 *   cursor:                 ^  = 2 pasos activos, el tercero espera
 */

import pb from '@/lib/pocketbaseClient';
import { runChain, toCanvas, canvasToBlob, get as getEngine, TRANSFORM } from './engines';

const COLLECTION = 'studio_projects';

/** Miniatura para las listas. Se guarda en el registro, no como archivo. */
function thumbnail(canvas, max = 240) {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(canvas.width * scale));
  t.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = t.getContext('2d');
  ctx.drawImage(canvas, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

export function fileUrl(record, field) {
  if (!record || !record[field]) return '';
  return pb.files.getURL(record, record[field]);
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // el canvas se lee pixel a pixel despues
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el archivo del proyecto.'));
    img.src = url;
  });
}

/** Crea el proyecto a partir del archivo subido. El original queda fijo. */
export async function create({ file, name, client = '', widthCm = null, garment = '', garmentColor = '', quantity = 1 }) {
  const owner = pb.authStore.record?.id;
  if (!owner) throw new Error('Inicia sesión para crear un proyecto.');

  const form = new FormData();
  form.append('name', name || file.name.replace(/\.[^.]+$/, ''));
  form.append('client', client);
  form.append('original', file);
  form.append('current', file); // sin pasos aplicados, el actual es el original
  form.append('steps', JSON.stringify([]));
  form.append('step_cursor', '0');
  form.append('status', 'borrador');
  form.append('quantity', String(quantity));
  if (widthCm) form.append('width_cm', String(widthCm));
  if (garment) form.append('garment', garment);
  if (garmentColor) form.append('garment_color', garmentColor);
  form.append('owner', owner);

  return pb.collection(COLLECTION).create(form);
}

export const listMine = (page = 1, perPage = 24) =>
  pb.collection(COLLECTION).getList(page, perPage, { sort: '-updated' });

export const getOne = (id) => pb.collection(COLLECTION).getOne(id);
export const remove = (id) => pb.collection(COLLECTION).delete(id);

/**
 * Reconstruye el estado actual corriendo la cadena sobre el original.
 * Devuelve tambien el canvas del original, que la vista "antes" necesita.
 */
export async function rebuild(record, onStep) {
  const original = toCanvas(await loadImage(fileUrl(record, 'original')));
  const steps = record.steps || [];
  const cursor = record.step_cursor ?? steps.length;
  const { canvas, applied } = await runChain(original, steps, cursor, onStep);
  return { original, canvas, steps, cursor, applied };
}

/**
 * Agrega un paso. Si habia pasos deshechos por delante, se descartan: la
 * historia se bifurca en el punto donde el usuario decidio seguir por otro
 * lado, igual que en cualquier editor.
 */
export async function addStep(record, engineId, params, canvas) {
  const engine = getEngine(engineId);
  if (!engine) throw new Error(`Motor desconocido: ${engineId}`);
  if (engine.kind !== TRANSFORM) throw new Error(`"${engine.label}" no modifica el arte, no es un paso.`);

  const steps = (record.steps || []).slice(0, record.step_cursor ?? (record.steps || []).length);
  steps.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    engine: engineId,
    label: engine.label,
    params,
    at: new Date().toISOString(),
  });
  return save(record, steps, steps.length, canvas);
}

/** Mueve el cursor sin tocar el historial. */
export async function setCursor(record, cursor, canvas) {
  const steps = record.steps || [];
  const next = Math.max(0, Math.min(cursor, steps.length));
  return save(record, steps, next, canvas);
}

export const undo = (record, canvas) => setCursor(record, (record.step_cursor ?? 0) - 1, canvas);
export const redo = (record, canvas) => setCursor(record, (record.step_cursor ?? 0) + 1, canvas);

/** Persiste pasos, cursor y el PNG del estado actual. */
export async function save(record, steps, cursor, canvas) {
  const form = new FormData();
  form.append('steps', JSON.stringify(steps));
  form.append('step_cursor', String(cursor));
  if (canvas) {
    const blob = await canvasToBlob(canvas);
    form.append('current', blob, `${record.name || 'proyecto'}.png`);
    form.append('preview', thumbnail(canvas));
  }
  return pb.collection(COLLECTION).update(record.id, form);
}

/** Guarda la intencion de impresion y el ultimo analisis del Inspector. */
export async function saveAnalysis(record, { analysis, dtfScore, widthCm, status }) {
  const payload = {};
  if (analysis !== undefined) payload.analysis = analysis;
  if (dtfScore !== undefined) payload.dtf_score = dtfScore;
  if (widthCm !== undefined) payload.width_cm = widthCm;
  if (status !== undefined) payload.status = status;
  return pb.collection(COLLECTION).update(record.id, payload);
}

export async function updateFields(record, fields) {
  return pb.collection(COLLECTION).update(record.id, fields);
}
