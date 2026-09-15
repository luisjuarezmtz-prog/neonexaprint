/*!
 * Neonexa Guía de Medidas — tablas de talla y visualizador a escala.
 *
 * Portado de Neonexa-Guia-Medidas-Standalone-v1.0 (src/app.tsx), autorizado
 * por el cliente. Mismas tablas, mismas constantes y la misma curva de
 * recoloreado. No cambiar los valores de referencia (72 × 84 cm) ni los
 * límites de escala: de ellos depende que el diseño mantenga su tamaño
 * físico al cambiar de talla.
 *
 * AVISO DEL MÓDULO ORIGINAL: las tablas son referencias de playera, no
 * fichas certificadas de cada fabricante, y para sudadera hay que verificar
 * las medidas reales. La vista es una simulación, no un patrón de confección.
 */

export const SIZE_GUIDES = {
  men: {
    label: 'Hombre / Unisex',
    sizes: [
      { size: 'XS', width: 46, height: 66, chest: '86–91 cm' },
      { size: 'S', width: 49, height: 69, chest: '92–97 cm' },
      { size: 'M', width: 52, height: 72, chest: '98–103 cm' },
      { size: 'L', width: 55, height: 74, chest: '104–109 cm' },
      { size: 'XL', width: 58, height: 76, chest: '110–117 cm' },
      { size: '2XL', width: 61, height: 78, chest: '118–125 cm' },
      { size: '3XL', width: 64, height: 80, chest: '126–133 cm' },
      { size: '4XL', width: 68, height: 82, chest: '134–141 cm' },
      { size: '5XL', width: 72, height: 84, chest: '142–149 cm' },
    ],
  },
  women: {
    label: 'Mujer',
    sizes: [
      { size: 'XS', width: 40, height: 59, chest: '76–81 cm' },
      { size: 'S', width: 43, height: 61, chest: '82–87 cm' },
      { size: 'M', width: 46, height: 63, chest: '88–93 cm' },
      { size: 'L', width: 49, height: 65, chest: '94–99 cm' },
      { size: 'XL', width: 52, height: 67, chest: '100–107 cm' },
      { size: '2XL', width: 55, height: 69, chest: '108–115 cm' },
      { size: '3XL', width: 58, height: 71, chest: '116–123 cm' },
    ],
  },
  kids: {
    label: 'Niño',
    sizes: [
      { size: '2', age: '2–3 años', width: 29, height: 40 },
      { size: '4', age: '4–5 años', width: 32, height: 44 },
      { size: '6', age: '6–7 años', width: 35, height: 48 },
      { size: '8', age: '8–9 años', width: 38, height: 52 },
      { size: '10', age: '10–11 años', width: 41, height: 56 },
      { size: '12', age: '12–13 años', width: 44, height: 60 },
      { size: '14', age: '13–14 años', width: 47, height: 64 },
      { size: '16', age: '14–16 años', width: 50, height: 67 },
    ],
  },
};

export const MEASURE_REFERENCE_WIDTH_CM = 72;
export const MEASURE_REFERENCE_HEIGHT_CM = 84;

export const MOCKUP_COLORS = ['#111318', '#f4f4f1', '#8f949d', '#b91f2e', '#182d58', '#2255a4', '#18705b'];
export const NATIVE_GARMENT = '#111318';

export const BASE_PATHS = {
  shirt: { front: '/mockups/shirt.png', back: '/mockups/shirt-back.png' },
  hoodie: { front: '/mockups/hoodie-front-no-cords.png', back: '/mockups/hoodie-back.png' },
};

export function hexRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    image.src = url;
  });
}

/**
 * Una sola escala física para la vista: al cambiar de talla crece o encoge la
 * PRENDA, mientras un diseño de 28 cm se sigue viendo de 28 cm. Eso es lo que
 * hace que la guía sirva para comparar tallas.
 */
export function garmentScaleFor(widthCm, heightCm) {
  return Math.max(0.38, Math.min(1.12, Math.min(widthCm / MEASURE_REFERENCE_WIDTH_CM, heightCm / MEASURE_REFERENCE_HEIGHT_CM)));
}

export const visualPositionFor = (value, scale) => 50 + (value - 50) * scale;

/**
 * Recolorea la prenda conservando luces y sombras.
 *
 * El blanco lleva su propia curva: la prenda fotografiada es casi negra y su
 * rango tonal es muy estrecho, así que la curva normal la dejaría en un gris
 * medio en vez de blanca.
 */
export async function recolorMockupAsset(src, color, enabled = true, forceTint = false) {
  if (!enabled || (color.toLowerCase() === NATIVE_GARMENT && !forceTint)) return src;
  const image = await loadImageUrl(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return src;
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const [tr, tg, tb] = hexRgb(color);
  const isWhiteGarment = tr + tg + tb >= 700;
  for (let i = 0; i < frame.data.length; i += 4) {
    if (frame.data[i + 3] < 2) continue;
    const luminance = (frame.data[i] * 0.2126 + frame.data[i + 1] * 0.7152 + frame.data[i + 2] * 0.0722) / 255;
    const shade = isWhiteGarment
      ? Math.max(0.76, Math.min(1.05, 0.78 + Math.pow(luminance, 0.55) * 0.8))
      : Math.max(0.42, Math.min(1.08, 0.52 + luminance * 2.15));
    frame.data[i] = Math.min(255, Math.round(tr * shade));
    frame.data[i + 1] = Math.min(255, Math.round(tg * shade));
    frame.data[i + 2] = Math.min(255, Math.round(tb * shade));
  }
  context.putImageData(frame, 0, 0);
  return canvas.toDataURL('image/png');
}

/** DPI que tendrá el diseño impreso al ancho en centímetros elegido. */
export function effectiveDpiFor(design) {
  if (!design) return 0;
  const px = design.image.naturalWidth || design.image.width;
  return Math.round(px / (design.widthCm / 2.54));
}

/** Alto real del diseño en cm, derivado de su proporción. */
export function designHeightCm(design) {
  const w = design.image.naturalWidth || design.image.width;
  const h = design.image.naturalHeight || design.image.height;
  return design.widthCm * (h / w);
}

/** Hoja de guía 2200 × 1350: pecho y espalda con sus medidas anotadas. */
export async function buildGuideSheet({ garment, profile, size, garmentWidth, garmentHeight, bases, designs, scale }) {
  const canvas = document.createElement('canvas');
  canvas.width = 2200; canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f4f4f7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#171922';
  context.font = 'bold 44px Arial';
  context.fillText('NEONEXA · GUÍA DE MEDIDAS', 80, 78);
  context.font = '24px Arial';
  context.fillText(`${garment === 'shirt' ? 'Playera' : 'Sudadera'} ${SIZE_GUIDES[profile].label} · Talla ${size} · A ${garmentWidth} cm × B ${garmentHeight} cm`, 80, 118);

  const faces = ['front', 'back'];
  for (let index = 0; index < faces.length; index++) {
    const target = faces[index];
    const base = await loadImageUrl(bases[target]);
    const x = 90 + index * 1050, y = 170, box = 920;
    const garmentBox = box * scale;
    const garmentX = x + (box - garmentBox) / 2, garmentY = y + (box - garmentBox) / 2;
    context.drawImage(base, garmentX, garmentY, garmentBox, garmentBox);

    const design = designs[target];
    if (design) {
      const dw = box * (design.widthCm / MEASURE_REFERENCE_WIDTH_CM) * 0.62;
      const dh = dw * ((design.image.naturalHeight || design.image.height) / (design.image.naturalWidth || design.image.width));
      const cx = x + box * visualPositionFor(design.x, scale) / 100;
      const cy = y + box * visualPositionFor(design.y, scale) / 100;
      context.drawImage(design.image, cx - dw / 2, cy - dh / 2, dw, dh);
      context.fillStyle = '#7457ff';
      context.font = 'bold 22px Arial';
      context.fillText(`${design.widthCm.toFixed(1)} × ${designHeightCm(design).toFixed(1)} cm`, x + 310, 1150);
    }
    context.fillStyle = '#30333d';
    context.font = 'bold 28px Arial';
    context.fillText(target === 'front' ? 'PECHO' : 'ESPALDA', x + 390, 1120);
  }

  context.fillStyle = '#747986';
  context.font = '20px Arial';
  context.fillText('Prenda extendida en plano. Tolerancia de fabricación: ±1–2 cm. Confirma la ficha del fabricante antes de producir.', 80, 1300);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
