// Runs the 8 Tools' image processing off the browser's main thread, so the
// page stays responsive (scrolling, other tabs, the progress bar itself)
// while a heavy per-pixel loop (flood-fill background removal, halftone dot
// grids, unsharp-mask sharpening, etc.) is running. One worker instance per
// run — ImageToolLayout spins it up and terminates it when done.

import {
  inspect, removeBackground, upscale, vectorize,
  cleanTransparency, smartHalftone, shirtSimulate, prepareRip,
} from '@/lib/toolProcessors';

const TOOLS = {
  inspector: inspect,
  'background-remover': removeBackground,
  upscaler: upscale,
  vectorizer: vectorize,
  'transparency-cleaner': cleanTransparency,
  'halftone-smart': smartHalftone,
  'shirt-simulator': shirtSimulate,
  'rip-preparer': prepareRip,
};

self.onmessage = async (e) => {
  const { tool, bitmap, params } = e.data;
  const fn = TOOLS[tool];
  if (!fn) { self.postMessage({ type: 'error', message: `Herramienta desconocida: ${tool}` }); return; }

  try {
    const onP = (value) => self.postMessage({ type: 'progress', value });
    const result = await fn(bitmap, params, onP);
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message || err) });
  } finally {
    bitmap.close?.();
  }
};
