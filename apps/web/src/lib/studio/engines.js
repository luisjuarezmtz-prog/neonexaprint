/*!
 * NEONEXA STUDIO — Paso 2 del roadmap V2: contrato comun de motores.
 *
 * Los motores portados (halftoneEngine, backgroundEngine, vectorEngine,
 * inspectorEngine, mockupEngine, sizeGuideEngine) traen matematica verificada
 * y autorizada por el cliente. Este archivo NO los modifica: los envuelve para
 * que todos hablen el mismo idioma y se puedan encadenar.
 *
 * TRES TIPOS, NO UNO
 *
 * El diagrama del roadmap los dibuja a todos como cajas iguales, pero el
 * codigo dice otra cosa y conviene respetarlo:
 *
 *   transform  canvas → canvas    Encadenable. Modifica el arte.
 *   analyze    canvas → datos     No modifica nada. Se puede correr cuando sea.
 *   render     canvas → entregable  Terminal. Produce SVG, PNG de hoja, TXT.
 *
 * Esa distincion importa: un mockup no puede alimentar a un halftone -es una
 * presentacion, no el arte-, y un SVG no puede entrar a un motor de pixeles.
 * Encadenar a ciegas produciria basura silenciosa.
 *
 * CONTRATO
 *
 *   run(canvas, params) → Promise<{ canvas?, data?, deliverables?, meta }>
 *
 *   canvas        estado nuevo del arte (solo transform)
 *   data          resultado del analisis (solo analyze)
 *   deliverables  [{ name, blob }] para descargar (solo render)
 *   meta          lo que el motor quiera reportar a la interfaz
 */

import { removeOuterBackground, trimCanvas, detectBackgroundColor } from '@/lib/backgroundEngine';
import { process as halftoneProcess, analyzeImage as halftoneRecipe } from '@/lib/halftoneEngine';
import { process as vectorProcess } from '@/lib/vectorEngine';
import { analyze as inspectorAnalyze, dpiAtWidth, buildReport } from '@/lib/inspectorEngine';

export const TRANSFORM = 'transform';
export const ANALYZE = 'analyze';
export const RENDER = 'render';

/** Normaliza cualquier fuente (imagen, canvas, bitmap) a un canvas propio. */
export function toCanvas(source) {
  if (source instanceof HTMLCanvasElement) return source;
  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  // Estos canvas siempre terminan leidos pixel a pixel por algun motor.
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Copia independiente, para no mutar el estado anterior de la historia. */
export function cloneCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve) => canvas.toBlob(resolve, type));
}

export const ENGINES = {
  background: {
    id: 'background',
    label: 'Quitar fondo',
    kind: TRANSFORM,
    // Sin color explicito se toma el de las esquinas del canvas que entra,
    // no el del original: tras otro paso el fondo pudo haber cambiado.
    defaults: { backgroundColor: null, tolerance: 28, decontaminate: 70, trim: false },
    async run(canvas, params = {}) {
      const backgroundColor = params.backgroundColor || detectBackgroundColor(canvas);
      const r = removeOuterBackground(canvas, { ...params, backgroundColor });
      const out = params.trim ? trimCanvas(r.canvas) : r.canvas;
      return {
        canvas: out,
        meta: { backgroundColor, removed: r.removed, remaining: r.remaining, width: out.width, height: out.height },
      };
    },
  },

  halftone: {
    id: 'halftone',
    label: 'Semitono',
    kind: TRANSFORM,
    defaults: {
      garmentColor: '#ffffff', pattern: 'circle', size: 4, gap: 10, angle: 0,
      contrast: 15, brightness: 0, highlightProtection: 0, shadowProtection: 0,
      tolerance: 30, dpi: 300, lpi: 45,
    },
    // La receta automatica del motor mira la imagen y propone ajustes. En el
    // Studio se ofrece como sugerencia, no se aplica sola: el usuario ya eligio
    // color de prenda en el proyecto y no queremos pisarselo.
    async suggest(canvas) { return halftoneRecipe(canvas); },
    async run(canvas, params = {}) {
      const r = await halftoneProcess(canvas, { ...this.defaults, ...params });
      return {
        canvas: r.canvas,
        meta: { removed: r.removed, remaining: r.remaining, width: r.width, height: r.height },
      };
    },
  },

  inspector: {
    id: 'inspector',
    label: 'Inspector',
    kind: ANALYZE,
    defaults: { printCm: 30, minDpi: 150 },
    async run(canvas, params = {}) {
      // El motor pide un File para peso y formato. Analizando el estado actual
      // de un proyecto ese File ya no existe, asi que se codifica el canvas: el
      // peso reportado es el de lo que se esta revisando, no el de la subida.
      const file = params.file || new File(
        [await canvasToBlob(canvas)],
        (params.name || 'proyecto') + '.png',
        { type: 'image/png' },
      );
      const r = inspectorAnalyze(canvas, file);
      const printCm = params.printCm ?? this.defaults.printCm;
      const minDpi = params.minDpi ?? this.defaults.minDpi;
      const dpi = dpiAtWidth(r.width, printCm);
      return {
        data: { ...r, dpi, printCm, minDpi, dpiLow: dpi < minDpi },
        meta: { width: r.width, height: r.height, dpi },
      };
    },
    report(data, fileName) {
      return buildReport({
        fileName, metrics: data.metrics, notes: data.notes,
        printCm: data.printCm, dpi: data.dpi, minDpi: data.minDpi,
      });
    },
  },

  vector: {
    id: 'vector',
    label: 'Vectorizar',
    kind: RENDER,
    defaults: {
      mode: 'bw', threshold: null, invert: false, colors: 16, denoise: 1,
      sharpen: 0.5, smoothing: 0.75, simplify: 0.65, despeckle: 0.35,
      maxWorkingSize: 1200, removeBackground: false,
    },
    async run(canvas, params = {}) {
      const r = await vectorProcess(canvas, { ...this.defaults, ...params });
      return {
        deliverables: [{ name: 'vector.svg', blob: new Blob([r.svg], { type: 'image/svg+xml' }) }],
        meta: { pathCount: r.pathCount, width: r.width, height: r.height, mode: r.mode, layers: r.layers, svg: r.svg },
      };
    },
  },
};

export const list = () => Object.values(ENGINES);
export const byKind = (kind) => list().filter((e) => e.kind === kind);
export const get = (id) => ENGINES[id];

/**
 * Aplica una lista de pasos sobre un canvas base.
 *
 * Solo corre los `transform`: los `render` producen entregables y los
 * `analyze` no modifican nada, asi que ninguno pertenece a la cadena que
 * define el estado del arte. Si un paso trae un motor desconocido se detiene
 * ahi y lo reporta, en vez de saltarselo en silencio y devolver un resultado
 * que no corresponde a la historia guardada.
 *
 * @param {HTMLCanvasElement} base   normalmente el original del proyecto
 * @param {Array} steps              [{ engine, params }]
 * @param {number} [cursor]          cuantos pasos aplicar (deshacer mueve esto)
 */
export async function runChain(base, steps = [], cursor = steps.length, onStep) {
  let canvas = cloneCanvas(toCanvas(base));
  const applied = [];
  const limit = Math.max(0, Math.min(cursor, steps.length));
  for (let i = 0; i < limit; i++) {
    const step = steps[i];
    const engine = get(step.engine);
    if (!engine) throw new Error(`Paso ${i + 1}: motor desconocido "${step.engine}".`);
    if (engine.kind !== TRANSFORM) continue;
    const r = await engine.run(canvas, step.params);
    canvas = r.canvas;
    // La etiqueta la pone el motor, no el paso: una cadena armada por codigo
    // -o importada de otro proyecto- no trae `label` y el progreso saldria
    // como "undefined" en pantalla.
    applied.push({ ...step, label: step.label || engine.label, meta: r.meta });
    if (onStep) onStep(i + 1, limit, applied[applied.length - 1]);
  }
  return { canvas, applied };
}
