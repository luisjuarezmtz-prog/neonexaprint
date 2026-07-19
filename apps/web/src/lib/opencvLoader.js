// Lazy loader for OpenCV.js (WASM computer-vision library).
// Loads the official build once and resolves when the runtime is ready.

const CDN = 'https://docs.opencv.org/4.10.0/opencv.js';
let promise = null;

export function loadOpenCV() {
  if (promise) return promise;
  promise = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    const finish = () => {
      const cv = window.cv;
      if (!cv) { reject(new Error('OpenCV no disponible')); return; }
      // Newer builds resolve via cv.ready (a Promise); older via onRuntimeInitialized.
      if (cv.Mat) { resolve(cv); return; }
      if (typeof cv.then === 'function') {
        cv.then((real) => resolve(real || window.cv)).catch(reject);
        return;
      }
      cv.onRuntimeInitialized = () => resolve(window.cv);
    };

    const existing = document.querySelector('script[data-opencv]');
    if (existing) {
      if (window.cv) finish();
      else existing.addEventListener('load', finish);
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar OpenCV.js')));
      return;
    }

    const s = document.createElement('script');
    s.src = CDN;
    s.async = true;
    s.dataset.opencv = 'true';
    s.onload = finish;
    s.onerror = () => reject(new Error('No se pudo cargar OpenCV.js'));
    document.head.appendChild(s);
  });
  return promise;
}
