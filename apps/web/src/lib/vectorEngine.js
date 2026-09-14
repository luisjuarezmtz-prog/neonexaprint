/*!
 * Neonexa Vectorizar — motor de trazado raster→vector.
 * Todo el procesamiento ocurre en el navegador del usuario (sin backend).
 *
 * Algoritmos usados:
 *  - Nitidez (unsharp mask): realza el contraste en los bordes de color antes
 *    del umbral/cuantización, para que lleguen más definidos a esas etapas
 *  - Otsu (umbral automático óptimo entre dos clases)
 *  - Sieve / despeckle: fusiona regiones conexas pequeñas con su vecino
 *    dominante (mismo principio que el filtro "sieve" de GDAL), antes de
 *    trazar -no después-, para no dejar huecos donde había ruido.
 *  - Trazado de contorno por aristas de rejilla (equivalente a "marching
 *    squares" sobre un campo binario), con fill-rule="evenodd" para agujeros
 *  - Simplificación de polígonos Douglas-Peucker (iterativa)
 *  - Suavizado Catmull-Rom → Bézier cúbica, por vértice según ángulo de giro
 *  - K-means++ en espacio de color Lab (perceptual) para cuantización de color
 *
 * Portado del modulo independiente NeonexaVectorizar (v. 2026-08-27),
 * autorizado por el cliente. Mismas formulas; unico cambio: el IIFE que
 * colgaba window.NeonexaVectorizer se volvio un modulo ES.
 * No cambiar las formulas.
 */


// ---------- Utilidades de imagen ----------

function drawToWorkingCanvas(image, maxSize) {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, w, h);
  return {
    imageData: ctx.getImageData(0, 0, w, h),
    width: w,
    height: h,
    scale, // working px * (1/scale) = original px
    origWidth: srcW,
    origHeight: srcH,
  };
}

function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return gray;
}

function boxBlurRGB(imageData, radius) {
  if (radius <= 0) return imageData;
  const { width: w, height: h } = imageData;
  const src = imageData.data;
  const tmp = new Float32Array(src.length);
  const out = new Uint8ClampedArray(src.length);
  const passes = [
    [1, 0],
    [0, 1],
  ];
  let cur = Float32Array.from(src);
  for (const [dx, dy] of passes) {
    const next = new Float32Array(cur.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = x + dx * k, sy = y + dy * k;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const i = (sy * w + sx) * 4;
          r += cur[i]; g += cur[i + 1]; b += cur[i + 2]; a += cur[i + 3];
          n++;
        }
        const o = (y * w + x) * 4;
        next[o] = r / n; next[o + 1] = g / n; next[o + 2] = b / n; next[o + 3] = a / n;
      }
    }
    cur = next;
  }
  for (let i = 0; i < cur.length; i++) out[i] = cur[i];
  return new ImageData(out, w, h);
}

// ---------- Filtro de mediana ----------
// A diferencia de un difuminado promedio (que MEZCLA colores), la mediana
// por canal SNAPEA cada píxel a uno de los colores realmente presentes en
// su vecindad. Esto es clave para arte de líneas: la franja de transición
// de 1-2 px entre un contorno negro y su relleno de color (anti-aliasing,
// y el "ringing" típico de JPEG cerca de bordes duros) es tan angosta que
// una ventana de mediana centrada en ella queda dominada por los píxeles
// planos de un lado u otro, colapsando la franja al color del contorno o
// del relleno -en vez de crear un tono intermedio que k-means podría
// agrupar como si fuera su propio color de diseño (un halo pegado al
// contorno en el resultado final)-.
function medianFilterRGB(imageData, radius) {
  if (radius <= 0) return imageData;
  const { data, width: w, height: h } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const windowSize = (2 * radius + 1) * (2 * radius + 1);
  const rArr = new Uint8ClampedArray(windowSize);
  const gArr = new Uint8ClampedArray(windowSize);
  const bArr = new Uint8ClampedArray(windowSize);
  const mid = windowSize >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const i = (sy * w + sx) * 4;
          rArr[idx] = data[i]; gArr[idx] = data[i + 1]; bArr[idx] = data[i + 2];
          idx++;
        }
      }
      rArr.sort(); gArr.sort(); bArr.sort();
      const o = (y * w + x) * 4;
      out[o] = rArr[mid]; out[o + 1] = gArr[mid]; out[o + 2] = bArr[mid];
      out[o + 3] = data[o + 3];
    }
  }
  return new ImageData(out, w, h);
}

// ---------- Nitidez (unsharp mask) ----------
// out = original + amount*(original - difuminado). Realza el contraste
// justo en los bordes de color (donde el difuminado se aleja más del
// original), sin afectar zonas planas (donde difuminado ≈ original). Se
// aplica ANTES del umbral/cuantización de color, así que los bordes llegan
// más definidos a esas etapas en vez de después, cuando ya no ayuda.
function unsharpMask(imageData, amount, radius) {
  if (amount <= 0) return imageData;
  const blurred = boxBlurRGB(imageData, radius);
  const { data, width, height } = imageData;
  const bd = blurred.data;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] + amount * (data[i] - bd[i]);
    out[i + 1] = data[i + 1] + amount * (data[i + 1] - bd[i + 1]);
    out[i + 2] = data[i + 2] + amount * (data[i + 2] - bd[i + 2]);
    out[i + 3] = data[i + 3];
  }
  return new ImageData(out, width, height);
}

function otsuThreshold(gray, imageData) {
  const alpha = imageData.data;
  const hist = new Array(256).fill(0);
  let total = 0;
  for (let p = 0; p < gray.length; p++) {
    if (alpha[p * 4 + 3] < 16) continue;
    hist[gray[p]]++;
    total++;
  }
  if (!total) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, varMax = -1, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) {
      varMax = between;
      threshold = t;
    }
  }
  return threshold;
}

function binarize(imageData, gray, threshold, invert) {
  const alpha = imageData.data;
  const bmp = new Uint8Array(gray.length);
  for (let p = 0; p < gray.length; p++) {
    const opaque = alpha[p * 4 + 3] >= 16;
    let v = opaque && gray[p] < threshold ? 1 : 0;
    if (invert) v = opaque ? 1 - v : 0;
    bmp[p] = v;
  }
  return bmp;
}

// ---------- Sieve / despeckle: fusiona regiones pequeñas con su vecino ----------
// Mismo principio que el filtro "sieve" de GDAL: en vez de simplemente
// borrar una región diminuta (lo que deja un hueco sin pintar), la fusiona
// con la etiqueta vecina más frecuente en su borde. Se procesa de la región
// más chica a la más grande para permitir fusiones en cadena. Las regiones
// que tocan el borde de la imagen NUNCA se fusionan (evita "comerse" el
// margen real de la imagen si el umbral de ruido es muy alto).

const N8 = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
];

function sieve(labels, w, h, minPixels) {
  if (minPixels <= 1) return labels;
  const n = w * h;
  const visited = new Uint8Array(n);
  const comps = [];
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const lbl = labels[start];
    visited[start] = 1;
    const stack = [start];
    const pixels = [start];
    let touchesBorder = false;
    while (stack.length) {
      const cur = stack.pop();
      const cy = (cur / w) | 0, cx = cur % w;
      if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) touchesBorder = true;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nidx = ny * w + nx;
        if (!visited[nidx] && labels[nidx] === lbl) {
          visited[nidx] = 1;
          stack.push(nidx);
          pixels.push(nidx);
        }
      }
    }
    comps.push({ pixels, label: lbl, touchesBorder });
  }
  comps.sort((a, b) => a.pixels.length - b.pixels.length);
  for (const comp of comps) {
    if (comp.touchesBorder || comp.pixels.length >= minPixels) continue;
    const tally = new Map();
    for (const idx of comp.pixels) {
      const cy = (idx / w) | 0, cx = idx % w;
      for (const [dx, dy] of N8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nlbl = labels[ny * w + nx];
        if (nlbl !== comp.label) tally.set(nlbl, (tally.get(nlbl) || 0) + 1);
      }
    }
    let bestLabel = comp.label, bestCount = -1;
    for (const [lbl, count] of tally) if (count > bestCount) { bestCount = count; bestLabel = lbl; }
    if (bestLabel !== comp.label) for (const idx of comp.pixels) labels[idx] = bestLabel;
  }
  return labels;
}

// ---------- Trazado de contorno por aristas de rejilla ----------
// Para cada píxel de la máscara, cada lado que colinda con fondo (o el borde
// de la imagen) aporta una arista dirigida sobre la rejilla de esquinas de
// píxel. Encadenar esas aristas (cada una se consume una sola vez) da los
// contornos cerrados de la máscara -tanto exteriores como agujeros- sin
// necesidad de asociar cada agujero a su figura: fill-rule="evenodd" ya
// resuelve el anidado correctamente a partir de las rutas sueltas.
// A diferencia de un rastreo por búsqueda geométrica (p.ej. Moore-Neighbor),
// este método consume cada arista como máximo una vez, así que SIEMPRE
// termina en tiempo acotado por el perímetro total, incluso con trazos muy
// finos (texto, líneas de 1px) que harían oscilar a un rastreador por vecinos.

function traceMaskEdges(mask, w, h) {
  const isFg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const vkey = (x, y) => y * (w + 1) + x;
  const edgesByStart = new Map();
  function addEdge(ax, ay, bx, by) {
    const k = vkey(ax, ay);
    let list = edgesByStart.get(k);
    if (!list) { list = []; edgesByStart.set(k, list); }
    list.push({ ax, ay, bx, by, used: false });
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFg(x, y)) continue;
      if (!isFg(x, y - 1)) addEdge(x, y, x + 1, y); // arriba: hacia la derecha
      if (!isFg(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // abajo: hacia la izquierda
      if (!isFg(x - 1, y)) addEdge(x, y + 1, x, y); // izquierda: hacia arriba
      if (!isFg(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // derecha: hacia abajo
    }
  }

  const loops = [];
  for (const list of edgesByStart.values()) {
    for (const e0 of list) {
      if (e0.used) continue;
      const loop = [];
      let cur = e0;
      let guard = 0;
      const guardMax = edgesByStart.size * 4 + 16;
      while (cur && !cur.used) {
        cur.used = true;
        loop.push({ x: cur.ax, y: cur.ay });
        const candidates = edgesByStart.get(vkey(cur.bx, cur.by));
        let next = null;
        if (candidates) {
          const open = candidates.filter((c) => !c.used);
          if (open.length === 1) {
            next = open[0];
          } else if (open.length > 1) {
            // Vértice "silla" (dos figuras tocándose en diagonal): elegir de
            // forma determinista por ángulo de giro. Cualquier emparejamiento
            // fijo produce la misma área visual bajo evenodd.
            const inDx = cur.bx - cur.ax, inDy = cur.by - cur.ay;
            let bestTurn = Infinity;
            for (const c of open) {
              const outDx = c.bx - c.ax, outDy = c.by - c.ay;
              const cross = inDx * outDy - inDy * outDx;
              const dot = inDx * outDx + inDy * outDy;
              const turn = Math.atan2(cross, dot);
              if (turn < bestTurn) { bestTurn = turn; next = c; }
            }
          }
        }
        cur = next;
        guard++;
        if (guard > guardMax) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(a) / 2;
}

// ---------- Douglas-Peucker (para polígono cerrado) ----------

function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

// Versión iterativa (pila explícita en el heap, no en la pila de llamadas):
// un contorno real puede tener miles de puntos y la recursión clásica de
// Douglas-Peucker desbordaría el call stack del navegador en esos casos.
function rdpOpen(pts, epsilon) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [startIdx, endIdx] = stack.pop();
    if (endIdx <= startIdx + 1) continue;
    const a = pts[startIdx], b = pts[endIdx];
    let dmax = 0, index = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const d = perpDist(pts[i], a, b);
      if (d > dmax) { dmax = d; index = i; }
    }
    if (index !== -1 && dmax > epsilon) {
      keep[index] = 1;
      stack.push([startIdx, index]);
      stack.push([index, endIdx]);
    }
  }
  const result = [];
  for (let i = 0; i < n; i++) if (keep[i]) result.push(pts[i]);
  return result;
}

function simplifyClosed(points, epsilon) {
  if (epsilon <= 0 || points.length <= 4) return points;
  // Anclar en el punto más lejano del centroide para minimizar el artefacto de costura.
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  cx /= points.length; cy /= points.length;
  let anchor = 0, best = -1;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - cx) ** 2 + (points[i].y - cy) ** 2;
    if (d > best) { best = d; anchor = i; }
  }
  const rotated = points.slice(anchor).concat(points.slice(0, anchor + 1)); // cerrado: primer==último
  const simplified = rdpOpen(rotated, epsilon);
  simplified.pop(); // quitar duplicado de cierre
  return simplified.length >= 3 ? simplified : points;
}

// ---------- Suavizado Catmull-Rom -> Bézier (mezclado con polígono recto) ----------
// El factor de suavizado se aplica POR VÉRTICE según su ángulo de giro: las
// esquinas duras (~90° o más, típicas de logos/texto) se mantienen rectas
// -si no, la curva de Catmull-Rom se "abomba" hacia afuera en cada esquina-
// mientras que los giros suaves (ruido de escalera del rasterizado) sí se
// suavizan con el factor pedido por el usuario.

const CORNER_THRESHOLD = (55 * Math.PI) / 180;

function turnAngle(p0, p1, p2) {
  const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
  const v2x = p2.x - p1.x, v2y = p2.y - p1.y;
  const len1 = Math.hypot(v1x, v1y) || 1;
  const len2 = Math.hypot(v2x, v2y) || 1;
  const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
  return Math.acos(dot); // 0 = sigue recto, PI = da media vuelta
}

function buildPathD(points, smoothing, epsilon) {
  const n = points.length;
  if (n < 3) return "";
  const s = Math.max(0, Math.min(1, smoothing));
  // Un giro "duro" formado por segmentos muy cortos casi siempre es ruido
  // de rasterizado (una muesca de un par de píxeles), no una esquina real
  // de diseño -esas casi siempre abarcan varios píxeles-. Sin este límite,
  // la protección de esquinas duras (pensada para no redondear logos)
  // termina preservando esas muescas como picos afilados en vez de
  // dejarlas suavizar. minCornerSpan escala con epsilon: a mayor tolerancia
  // de simplificación, mayor el segmento que hace falta para "contar" como
  // esquina intencional.
  const minCornerSpan = Math.max(3, epsilon * 3);
  const localS = new Array(n);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n];
    const angle = turnAngle(p0, p1, p2);
    const angleFactor = Math.max(0, Math.min(1, 1 - angle / CORNER_THRESHOLD));
    const shortestAdjacent = Math.min(Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.hypot(p2.x - p1.x, p2.y - p1.y));
    const noiseFactor = Math.max(0, Math.min(1, 1 - shortestAdjacent / minCornerSpan));
    const t = Math.max(angleFactor, noiseFactor);
    localS[i] = s * t;
  }
  let d = `M ${points[0].x} ${points[0].y} `;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const s1 = localS[i];
    const s2 = localS[(i + 1) % n];
    // Segmento p1->p2 muy corto entre puntos vecinos lejanos (regiones
    // diminutas/dentadas, más frecuentes con muchos colores + nitidez alta):
    // limitar la magnitud del vector tangente a la mitad de este segmento
    // evita que la curva de Catmull-Rom se dispare muy lejos de la figura.
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 0.001;
    const maxTangent = segLen * 0.5;

    let t1x = (p2.x - p0.x) / 6, t1y = (p2.y - p0.y) / 6;
    const t1len = Math.hypot(t1x, t1y);
    if (t1len > maxTangent) { const k = maxTangent / t1len; t1x *= k; t1y *= k; }

    let t2x = (p3.x - p1.x) / 6, t2y = (p3.y - p1.y) / 6;
    const t2len = Math.hypot(t2x, t2y);
    if (t2len > maxTangent) { const k = maxTangent / t2len; t2x *= k; t2y *= k; }

    const c1x = p1.x + s1 * t1x, c1y = p1.y + s1 * t1y;
    const c2x = p2.x - s2 * t2x, c2y = p2.y - s2 * t2y;
    d += `C ${round2(c1x)} ${round2(c1y)} ${round2(c2x)} ${round2(c2y)} ${round2(p2.x)} ${round2(p2.y)} `;
  }
  return d + "Z";
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// ---------- Trazado completo de una máscara binaria -> un solo path (evenodd) ----------
// fill-rule="evenodd" hace innecesario asociar cada agujero con su figura:
// basta con simplificar/suavizar cada contorno por separado y combinarlos.

function traceMask(mask, w, h, minArea, epsilon, smoothing) {
  const loops = traceMaskEdges(mask, w, h);
  let totalArea = 0;
  const dParts = [];
  for (const loop of loops) {
    const simplified = simplifyClosed(loop, epsilon);
    const area = polygonArea(simplified);
    if (area < minArea) continue;
    totalArea += area;
    const d = buildPathD(simplified, smoothing, epsilon);
    if (d) dParts.push(d);
  }
  return { area: totalArea, d: dParts.join(" ") };
}

// ---------- Conversión sRGB <-> Lab (D65) ----------
// K-means agrupa en Lab en vez de RGB porque la distancia euclidiana en Lab
// se aproxima mucho mejor a cómo el ojo humano percibe diferencias de color:
// evita que colores visualmente distintos se fusionen (o que casi-iguales
// se separen en clusters distintos) solo por cómo caen en el cubo RGB.

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToRgb(L, A, B) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const fInv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const x = fInv(fx) * 0.95047, y = fInv(fy), z = fInv(fz) * 1.08883;
  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

// ---------- K-means++ para cuantización de color ----------

function kppInit(samples, k, rng) {
  const centroids = [samples[Math.floor(rng() * samples.length)]];
  const distSq = new Float64Array(samples.length).fill(Infinity);
  while (centroids.length < k) {
    let total = 0;
    for (let i = 0; i < samples.length; i++) {
      const c = centroids[centroids.length - 1];
      const s = samples[i];
      const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i];
    }
    let r = rng() * total;
    let chosen = samples.length - 1;
    for (let i = 0; i < samples.length; i++) {
      r -= distSq[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.push(samples[chosen]);
  }
  return centroids;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kMeansQuantize(imageData, k) {
  const { data, width, height } = imageData;
  const n = width * height;
  const rng = mulberry32(20260826);

  // Convertir a Lab una sola vez (reutilizado para el muestreo Y la
  // asignación final de cada píxel).
  const lab = new Float32Array(n * 3);
  const opaque = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (data[i + 3] < 16) continue;
    opaque[p] = 1;
    const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2]);
    lab[p * 3] = L; lab[p * 3 + 1] = A; lab[p * 3 + 2] = B;
  }

  const samples = [];
  const sampleCap = 24000;
  const step = Math.max(1, Math.floor(n / sampleCap));
  for (let p = 0; p < n; p += step) {
    if (!opaque[p]) continue;
    samples.push([lab[p * 3], lab[p * 3 + 1], lab[p * 3 + 2]]);
  }
  if (samples.length < k) {
    // imagen casi vacía / muy pocos colores opacos: reducir k
    k = Math.max(1, samples.length);
  }
  if (!samples.length) return { centroids: [], labels: new Int16Array(n).fill(-1) };

  let centroids = kppInit(samples, k, rng);
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (const s of samples) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const cc = centroids[c];
        const d = (s[0] - cc[0]) ** 2 + (s[1] - cc[1]) ** 2 + (s[2] - cc[2]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2]; sums[best][3]++;
    }
    centroids = centroids.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
    counts = sums.map((s) => s[3]);
  }

  // Fusionar clusters demasiado cercanos en Lab. Un contorno negro grueso
  // genera una franja de anti-aliasing continua a su alrededor (transición
  // negro->color de relleno); esa franja tiene área total suficiente para
  // sobrevivir como su propio "color" -aunque sea angosta-, y termina
  // dibujándose como un halo pegado al contorno en vez de fundirse con el
  // relleno real. Fusionar (no solo despeckle, que filtra por área) es lo
  // que corrige esto: dos colores tan cercanos casi nunca son intención de
  // diseño, son la misma franja de transición partida en varios clusters.
  const MERGE_DISTANCE = 12;
  const parent = centroids.map((_, i) => i);
  function findRoot(i) { while (parent[i] !== i) i = parent[i]; return i; }
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let a = 0; a < centroids.length; a++) {
      const ra = findRoot(a);
      if (ra !== a) continue;
      for (let b = a + 1; b < centroids.length; b++) {
        const rb = findRoot(b);
        if (rb !== b || rb === ra) continue;
        const d = Math.hypot(centroids[ra][0] - centroids[rb][0], centroids[ra][1] - centroids[rb][1], centroids[ra][2] - centroids[rb][2]);
        if (d < MERGE_DISTANCE) {
          if (counts[ra] >= counts[rb]) { parent[rb] = ra; counts[ra] += counts[rb]; }
          else { parent[ra] = rb; counts[rb] += counts[ra]; }
          mergedAny = true;
        }
      }
    }
  }
  const uniqueRoots = [...new Set(centroids.map((_, i) => findRoot(i)))];
  centroids = uniqueRoots.map((r) => centroids[r]);
  k = centroids.length;

  const labels = new Int16Array(n).fill(-1);
  for (let p = 0; p < n; p++) {
    if (!opaque[p]) continue;
    const l0 = lab[p * 3], l1 = lab[p * 3 + 1], l2 = lab[p * 3 + 2];
    let best = 0, bestD = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const cc = centroids[c];
      const d = (l0 - cc[0]) ** 2 + (l1 - cc[1]) ** 2 + (l2 - cc[2]) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    labels[p] = best;
  }

  // Color representativo de cada cluster: el color EXACTO más frecuente
  // (moda), no el promedio Lab. El promedio se contamina con los píxeles
  // de anti-aliasing del borde (mezcla del color con su vecino), lo que
  // sistemáticamente aclara/desatura colores planos -típicamente el negro
  // puro de un contorno de caricatura-. La moda es inmune a ese ruido de
  // borde porque un relleno plano (miles de píxeles idénticos) siempre
  // supera en cantidad a la delgada franja de píxeles mezclados del borde.
  const modeCounts = Array.from({ length: k }, () => new Map());
  for (let p = 0; p < n; p++) {
    const lbl = labels[p];
    if (lbl < 0) continue;
    const i = p * 4;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const m = modeCounts[lbl];
    m.set(key, (m.get(key) || 0) + 1);
  }
  const meanRgb = centroids.map((c) => labToRgb(c[0], c[1], c[2]));
  const modeRgb = modeCounts.map((m, idx) => {
    let bestKey = -1, bestCount = -1;
    for (const [key, count] of m) if (count > bestCount) { bestCount = count; bestKey = key; }
    if (bestKey === -1) return meanRgb[idx];
    return [(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255];
  });
  return { centroids: modeRgb, labels };
}

function hex(c) {
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

// ---------- API pública ----------

async function process(image, settings) {
  const opts = Object.assign(
    {
      mode: "bw",
      threshold: null, // null = automático (Otsu)
      invert: false,
      colors: 16,
      denoise: 1,
      sharpen: 0.5, // nitidez (unsharp mask) aplicada antes de umbral/color
      smoothing: 0.75, // curvatura de los trazos (Catmull-Rom)
      simplify: 0.65, // cuántos nodos se eliminan (tolerancia de Douglas-Peucker)
      despeckle: 0.35, // fuerza del filtro de ruido (fusiona regiones chicas con su vecino)
      maxWorkingSize: 1200,
      removeBackground: false,
    },
    settings || {}
  );

  const work = drawToWorkingCanvas(image, opts.maxWorkingSize);
  const { imageData, width, height, scale, origWidth, origHeight } = work;
  // minPixels a despeckle=100% funde regiones de hasta ~0.12% del área de
  // trabajo; a 0% no fusiona nada (sieve() ya sale rápido con minPixels<=1).
  const minPixels = Math.round(width * height * Math.max(0, Math.min(1, opts.despeckle)) * 0.0012);
  // La tolerancia de Douglas-Peucker escala con la resolución de trabajo:
  // un valor fijo en píxeles deja proporcionalmente MÁS ruido de escalera
  // sin limpiar cuanto mayor es la resolución (más escalones, más chicos).
  // Sin este escalado, subir "Resolución de trabajo" podía verse más
  // definido en general pero con más zigzags sin suavizar en los bordes.
  const epsilon = Math.max(0.05, Math.max(0, Math.min(1, opts.simplify)) * Math.max(width, height) * 0.0028);
  const sharpenAmount = Math.max(0, Math.min(2, opts.sharpen)) * 1.4;

  let shapes = []; // { area, d, fill }
  let usedThreshold = opts.threshold;

  if (opts.mode === "bw") {
    const sharpened = sharpenAmount > 0 ? unsharpMask(imageData, sharpenAmount, 2) : imageData;
    const gray = toGray(sharpened);
    const threshold = opts.threshold == null ? otsuThreshold(gray, sharpened) : opts.threshold;
    usedThreshold = threshold;
    const bmp = binarize(sharpened, gray, threshold, opts.invert);
    sieve(bmp, width, height, minPixels);
    const traced = traceMask(bmp, width, height, 2, epsilon, opts.smoothing);
    if (traced.d) shapes = [{ area: traced.area, d: traced.d, fill: "#000000" }];
  } else {
    const denoised = opts.denoise > 0 ? medianFilterRGB(imageData, opts.denoise) : imageData;
    const sharpened = sharpenAmount > 0 ? unsharpMask(denoised, sharpenAmount, 2) : denoised;
    const { centroids, labels } = kMeansQuantize(sharpened, Math.max(2, Math.min(64, opts.colors)));
    sieve(labels, width, height, minPixels);
    const k = centroids.length;
    const clusterArea = new Array(k).fill(0);
    for (let p = 0; p < labels.length; p++) if (labels[p] >= 0) clusterArea[labels[p]]++;
    let skipCluster = -1;
    if (opts.removeBackground && k > 1) {
      skipCluster = clusterArea.indexOf(Math.max(...clusterArea));
    }
    for (let c = 0; c < k; c++) {
      if (c === skipCluster) continue;
      const mask = new Uint8Array(width * height);
      for (let p = 0; p < labels.length; p++) mask[p] = labels[p] === c ? 1 : 0;
      const traced = traceMask(mask, width, height, 2, epsilon, opts.smoothing);
      if (traced.d) shapes.push({ area: traced.area, d: traced.d, fill: hex(centroids[c]) });
    }
    shapes.sort((a, b) => b.area - a.area);
  }

  const inv = 1 / scale; // reescala de resolución de trabajo -> tamaño original
  const scaledShapes = shapes.map((s) => ({
    fill: s.fill,
    d: s.d.replace(/-?\d+(\.\d+)?/g, (m) => round2(parseFloat(m) * inv)),
  }));

  const svg = buildSvg(scaledShapes, origWidth, origHeight);

  return {
    svg,
    width: origWidth,
    height: origHeight,
    pathCount: scaledShapes.length,
    threshold: usedThreshold,
    mode: opts.mode,
    // Una capa por color detectado ({fill, d}), en orden de pintado
    // (la primera va al fondo). buildSvg() las vuelve a combinar sin
    // necesidad de re-vectorizar -para el editor de paleta de colores.
    layers: scaledShapes,
  };
}

// Reconstruye el SVG final a partir de las capas -tal como las devuelve
// process()-, permitiendo recolorear u ocultar capas sin re-vectorizar.
function buildSvg(layers, width, height) {
  const pathsMarkup = layers
    .filter((s) => s.d && !s.hidden)
    .map((s) => `<path fill="${s.fill}" fill-rule="evenodd" d="${s.d}"/>`)
    .join("\n  ");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n` +
    `  ${pathsMarkup}\n` +
    `</svg>`
  );
}


export { process, buildSvg, otsuThreshold, toGray, drawToWorkingCanvas };
