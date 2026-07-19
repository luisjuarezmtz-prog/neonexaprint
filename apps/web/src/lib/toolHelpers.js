import pb from '@/lib/pocketbaseClient';

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onload = () => resolve({ img, dataUrl: r.result });
      img.onerror = reject;
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

export function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// Inject a pHYs chunk into a PNG blob so the file reports the given DPI.
function injectPngDpi(arrayBuffer, dpi) {
  const bytes = new Uint8Array(arrayBuffer);
  // PNG signature is 8 bytes; IHDR chunk follows: 4 len + 4 type + 13 data + 4 crc = 25 bytes.
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // = 33
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const chunkData = new Uint8Array(9);
  const dv = new DataView(chunkData.buffer);
  dv.setUint32(0, ppm); // x
  dv.setUint32(4, ppm); // y
  chunkData[8] = 1; // unit = metre

  const type = [0x70, 0x48, 0x59, 0x73]; // 'pHYs'
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  const cdv = new DataView(chunk.buffer);
  cdv.setUint32(0, 9);
  chunk.set(type, 4);
  chunk.set(chunkData, 8);
  // CRC over type + data
  const crcInput = new Uint8Array(4 + 9);
  crcInput.set(type, 0);
  crcInput.set(chunkData, 4);
  cdv.setUint32(17, crc32(crcInput));

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

let _crcTable;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = _crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function downloadCanvasDpi(canvas, filename, dpi = 300) {
  canvas.toBlob(async (blob) => {
    let out = blob;
    try {
      const buf = await blob.arrayBuffer();
      out = new Blob([injectPngDpi(buf, dpi)], { type: 'image/png' });
    } catch { /* fall back to raw blob */ }
    const url = URL.createObjectURL(out);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export async function saveDesign({ title, tool, thumbnail, config }) {
  if (!pb.authStore.isValid) throw new Error('Necesitas iniciar sesión para guardar.');
  return pb.collection('designs').create({
    title, tool, thumbnail: thumbnail || '', config: config || {},
    owner: pb.authStore.record.id,
  });
}
