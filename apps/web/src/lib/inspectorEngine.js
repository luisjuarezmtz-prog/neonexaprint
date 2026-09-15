/*!
 * Neonexa Inspector de impresión — análisis previo al DTF.
 *
 * Portado del módulo independiente Neonexa-Inspector-Standalone-v1.0,
 * autorizado por el cliente. Mismos conteos, mismos umbrales y mismo texto
 * de las advertencias. No cambiar las constantes (alfa 8 del borde, 230/210
 * del halo, 1% de semitransparencia, 0.5% de halo, 1500px de resolución).
 *
 * A diferencia de la versión anterior —que analizaba una reducción a 500px—
 * aquí se recorre la imagen a resolución completa, así que los porcentajes
 * son los reales del archivo y no los de una miniatura.
 */

export function formatBytes(n) {
  return n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB';
}

/**
 * Recorre la imagen pixel por pixel y devuelve métricas y advertencias.
 *
 * @param {HTMLImageElement} image
 * @param {File} file  se usa para peso y formato
 * @returns {{metrics: Array, notes: Array, counts: Object, width: number, height: number}}
 */
export function analyze(image, file) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(0, 0, width, height).data;

  let transparent = 0, semi = 0, opaque = 0, edgeOpaque = 0, halo = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = d[i + 3];
      if (a === 0) transparent++;
      else if (a < 255) semi++;
      else opaque++;
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && a > 8) edgeOpaque++;
      // Halo: pixel semitransparente y casi blanco — el residuo típico de un
      // recorte hecho sobre fondo claro.
      if (a > 0 && a < 230 && d[i] > 210 && d[i + 1] > 210 && d[i + 2] > 210) halo++;
    }
  }

  const total = width * height;
  const hasAlpha = transparent > 0;
  const cmAt300 = (width / 300) * 2.54;

  const metrics = [
    ['Dimensiones', `${width} × ${height}px`],
    ['Peso', formatBytes(file.size)],
    ['Transparencia', hasAlpha ? 'Sí' : 'No'],
    ['Semitransparencia', `${((semi / total) * 100).toFixed(2)}%`],
    ['Ancho a 300 DPI', `${cmAt300.toFixed(1)} cm`],
    ['Formato', (file.type.split('/')[1] || '—').toUpperCase()],
  ];

  const notes = [];
  if (!hasAlpha) notes.push(['warn', 'La imagen no contiene transparencia.']);
  if (semi / total > 0.01) notes.push(['warn', 'Contiene semitransparencias; revísalas antes de generar base blanca.']);
  if (edgeOpaque) notes.push(['bad', 'Hay píxeles visibles tocando el borde del lienzo.']);
  if (halo / Math.max(1, opaque + semi) > 0.005) notes.push(['warn', 'Se detectaron posibles halos claros en bordes transparentes.']);
  if (width < 1500) notes.push(['warn', 'Resolución baja para estampados grandes.']);
  if (!notes.length) notes.push(['ok', 'El archivo supera las comprobaciones principales.']);

  return {
    metrics, notes, width, height,
    counts: { transparent, semi, opaque, edgeOpaque, halo, total },
  };
}

/**
 * DPI resultante al imprimir a un ancho dado. Se conserva de la versión
 * anterior de la herramienta: el módulo del cliente solo reporta el ancho
 * fijo a 300 DPI, y para un taller la pregunta práctica es la inversa
 * -"a 40 cm, ¿con cuántos DPI queda?"-.
 */
export function dpiAtWidth(pixelWidth, printCm) {
  return Math.round(pixelWidth / (printCm / 2.54));
}

/** Reporte de texto descargable, con el mismo encabezado del módulo original. */
export function buildReport({ fileName, metrics, notes, printCm, dpi, minDpi }) {
  let txt = 'REPORTE NEONEXA INSPECTOR\n';
  txt += `Archivo: ${fileName}\n`;
  txt += metrics.map((m) => m.join(': ')).join('\n');
  if (printCm) {
    txt += `\nDPI a ${printCm} cm: ${dpi}${dpi < minDpi ? ` (por debajo del mínimo de ${minDpi})` : ''}`;
  }
  txt += '\n\n' + notes.map((n) => '- ' + n[1]).join('\n');
  return txt;
}
