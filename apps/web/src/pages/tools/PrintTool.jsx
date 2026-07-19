import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import { useAuth } from '@/lib/auth';
import { loadImageFile, downloadCanvas, saveDesign } from '@/lib/toolHelpers';
import { Upload, Download, Save, Printer, FlipHorizontal, Ruler } from 'lucide-react';

const SHEETS = {
  A4:     { w: 21.0,  h: 29.7,  label: 'A4 (21×29.7 cm)' },
  A3:     { w: 29.7,  h: 42.0,  label: 'A3 (29.7×42 cm)' },
  '30x40':{ w: 30,    h: 40,    label: '30×40 cm' },
  '50x60':{ w: 50,    h: 60,    label: '50×60 cm' },
};

const DTF_PRICE_PER_LINEAR_METER = 120; // MXN default — editable

export default function PrintTool() {
  const { isAuthed } = useAuth();
  const previewRef = useRef(null);
  const [img, setImg] = useState(null);
  const [title, setTitle] = useState('Archivo DTF');

  // Format selection: one of SHEETS keys or 'dtf-metro'
  const [sheetKey, setSheetKey] = useState('A4');

  // DTF por metro specific state
  const [metroAncho, setMetroAncho] = useState(0.60);   // meters (roll width)
  const [metroLargo, setMetroLargo] = useState(1.00);   // meters (length)
  const [pricePerMeter, setPricePerMeter] = useState(DTF_PRICE_PER_LINEAR_METER);

  const [widthCm, setWidthCm] = useState(20);
  const [dpi, setDpi] = useState(300);
  const [mirror, setMirror] = useState(false);
  const [margin, setMargin] = useState(1);
  const [bg, setBg] = useState('transparent');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const isDtfMetro = sheetKey === 'dtf-metro';

  // Dynamic sheet dimensions
  const sheet = isDtfMetro
    ? { w: Math.round(metroAncho * 100), h: Math.round(metroLargo * 100) }
    : SHEETS[sheetKey];

  // Cost calculation for DTF metro
  const costoLineal = (metroLargo * pricePerMeter).toFixed(2);
  const costoTotal  = (metroAncho * metroLargo * pricePerMeter).toFixed(2);
  const areaM2      = (metroAncho * metroLargo).toFixed(4);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { img: i, dataUrl } = await loadImageFile(f);
    setImg({ el: i, dataUrl, w: i.naturalWidth, h: i.naturalHeight });
  };

  useEffect(() => { drawPreview(); }, [img, sheetKey, widthCm, mirror, margin, bg, metroAncho, metroLargo]);

  const drawPreview = () => {
    const c = previewRef.current; if (!c) return;
    const maxPreviewW = 600;
    const aspectRatio = sheet.h / sheet.w;
    const previewW = maxPreviewW;
    const previewH = Math.min(Math.round(aspectRatio * previewW), 700);
    c.width = previewW; c.height = previewH;
    const ctx = c.getContext('2d');

    // Background
    if (bg === 'white') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, previewW, previewH);
    } else if (bg === 'black') {
      ctx.fillStyle = '#0B0B0B'; ctx.fillRect(0, 0, previewW, previewH);
    } else {
      // Checker for transparent
      const s = 12;
      for (let y = 0; y < previewH; y += s) {
        for (let x = 0; x < previewW; x += s) {
          ctx.fillStyle = ((x/s + y/s) % 2 === 0) ? '#1a1a1a' : '#222';
          ctx.fillRect(x, y, s, s);
        }
      }
    }

    // DTF metro: draw roll ruler marks
    if (isDtfMetro) {
      ctx.strokeStyle = 'rgba(0,240,255,0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      // Every 10cm horizontal line
      const cmH = previewH / sheet.h;
      for (let cm = 10; cm < sheet.h; cm += 10) {
        const y = cm * cmH;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(previewW, y); ctx.stroke();
      }
    }

    // Safety margin dashes
    const mxPx = (margin / sheet.w) * previewW;
    const myPx = (margin / sheet.h) * previewH;
    ctx.strokeStyle = 'rgba(0,240,255,0.6)';
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1;
    ctx.strokeRect(mxPx, myPx, previewW - 2*mxPx, previewH - 2*myPx);
    ctx.setLineDash([]);

    if (img) {
      const ratio = img.h / img.w;
      const wPx = (widthCm / sheet.w) * previewW;
      const hPx = wPx * ratio;
      const x = (previewW - wPx) / 2;
      const y = (previewH - hPx) / 2;
      ctx.save();
      if (mirror) { ctx.translate(previewW, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img.el, mirror ? previewW - x - wPx : x, y, wPx, hPx);
      ctx.restore();
      ctx.strokeStyle = '#FF2D95'; ctx.lineWidth = 1;
      ctx.strokeRect(x, y, wPx, hPx);
    }
  };

  const buildExport = async () => {
    const sheetWpx = Math.round((sheet.w / 2.54) * dpi);
    const sheetHpx = Math.round((sheet.h / 2.54) * dpi);
    const c = document.createElement('canvas');
    c.width = sheetWpx; c.height = sheetHpx;
    const ctx = c.getContext('2d');
    if (bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0,0,sheetWpx,sheetHpx); }
    if (bg === 'black') { ctx.fillStyle = '#000'; ctx.fillRect(0,0,sheetWpx,sheetHpx); }
    if (img) {
      const ratio = img.h / img.w;
      const wPx = Math.round((widthCm / 2.54) * dpi);
      const hPx = Math.round(wPx * ratio);
      const x = (sheetWpx - wPx) / 2;
      const y = (sheetHpx - hPx) / 2;
      ctx.save();
      if (mirror) { ctx.translate(sheetWpx, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img.el, mirror ? sheetWpx - x - wPx : x, y, wPx, hPx);
      ctx.restore();
    }
    return c;
  };

  const download = async () => {
    if (!img) { setMsg('Sube una imagen primero.'); return; }
    setBusy(true); setMsg('');
    try {
      const c = await buildExport();
      const label = isDtfMetro
        ? `DTFmetro_${Math.round(metroAncho*100)}x${Math.round(metroLargo*100)}cm`
        : sheetKey;
      downloadCanvas(c, `${title}_${label}_${dpi}dpi.png`);
    } catch { setMsg('No se pudo exportar.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!img) { setMsg('Sube una imagen primero.'); return; }
    setBusy(true); setMsg('');
    try {
      const thumb = document.createElement('canvas');
      const thumbAR = sheet.h / sheet.w;
      thumb.width = 400; thumb.height = Math.round(400 * thumbAR);
      const tctx = thumb.getContext('2d');
      tctx.fillStyle = bg === 'white' ? '#fff' : bg === 'black' ? '#000' : '#111';
      tctx.fillRect(0, 0, thumb.width, thumb.height);
      const ratio = img.h / img.w;
      const wPx = (widthCm / sheet.w) * thumb.width;
      const hPx = wPx * ratio;
      tctx.drawImage(img.el, (thumb.width-wPx)/2, (thumb.height-hPx)/2, wPx, hPx);
      await saveDesign({
        title: title || 'Archivo DTF',
        tool: 'print',
        thumbnail: thumb.toDataURL('image/jpeg', 0.7),
        config: isDtfMetro
          ? { sheet: 'dtf-metro', metroAncho, metroLargo, widthCm, dpi, mirror, margin, bg, pricePerMeter }
          : { sheet: sheetKey, widthCm, dpi, mirror, margin, bg },
      });
      setMsg('Guardado en tu panel.');
    } catch (e) { setMsg(e.message || 'Error al guardar.'); }
    finally { setBusy(false); }
  };

  const realHeightCm = img ? (widthCm * img.h / img.w).toFixed(1) : '—';
  const maxDesignW = Math.max(3, sheet.w - margin * 2);

  return (
    <ToolShell
      eyebrow="HERRAMIENTA · DTF READY"
      title="Preparar para Impresión"
      subtitle="Encuadra tu diseño a tamaño real, agrega márgenes y exporta a alta resolución."
      sidebar={
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className={labelCls}>Nombre</label>
            <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)}/>
          </div>

          {/* Upload */}
          <label className="nx-btn-ghost px-4 py-3 cursor-pointer inline-flex items-center gap-2 text-xs w-full justify-center">
            <Upload size={14}/> {img ? 'Cambiar imagen' : 'Subir imagen'}
            <input type="file" accept="image/*" hidden onChange={onFile}/>
          </label>

          {/* Format selector */}
          <div>
            <label className={labelCls}>Formato</label>
            <div className="grid grid-cols-1 gap-1">
              {Object.entries(SHEETS).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setSheetKey(k)}
                  className={`text-left px-3 py-2 text-xs border rounded transition-colors ${
                    sheetKey === k && !isDtfMetro
                      ? 'border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]'
                      : 'border-white/15 text-white/70 hover:border-white/30'
                  }`}
                >
                  {v.label}
                </button>
              ))}
              {/* DTF por metro option */}
              <button
                onClick={() => setSheetKey('dtf-metro')}
                className={`text-left px-3 py-2 text-xs border rounded transition-colors flex items-center gap-2 ${
                  isDtfMetro
                    ? 'border-[#FFD400] bg-[#FFD400]/10 text-[#FFD400]'
                    : 'border-white/15 text-white/70 hover:border-white/30'
                }`}
              >
                <Ruler size={12}/> DTF por metro lineal
              </button>
            </div>
          </div>

          {/* DTF Metro panel */}
          {isDtfMetro && (
            <div className="border border-[#FFD400]/25 rounded-md p-3 space-y-4 bg-[#FFD400]/5">
              <div className="text-xs font-display text-[#FFD400] tracking-wider uppercase">Rollo DTF personalizado</div>

              <div>
                <label className={labelCls}>Ancho del rollo (m)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="0.20" max="1.60" step="0.05"
                    value={metroAncho}
                    onChange={e => setMetroAncho(parseFloat(e.target.value))}
                    className={rangeCls}
                  />
                  <input
                    type="number" min="0.20" max="1.60" step="0.05"
                    value={metroAncho}
                    onChange={e => setMetroAncho(Math.min(1.60, Math.max(0.20, parseFloat(e.target.value) || 0.20)))}
                    className={`${inputCls} w-20 text-center`}
                  />
                </div>
                <div className="text-[10px] text-white/40 mt-1">{Math.round(metroAncho * 100)} cm</div>
              </div>

              <div>
                <label className={labelCls}>Largo del rollo (m)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min="0.10" max="10.00" step="0.10"
                    value={metroLargo}
                    onChange={e => setMetroLargo(parseFloat(e.target.value))}
                    className={rangeCls}
                  />
                  <input
                    type="number" min="0.10" max="10.00" step="0.10"
                    value={metroLargo}
                    onChange={e => setMetroLargo(Math.min(10.00, Math.max(0.10, parseFloat(e.target.value) || 0.10)))}
                    className={`${inputCls} w-20 text-center`}
                  />
                </div>
                <div className="text-[10px] text-white/40 mt-1">{Math.round(metroLargo * 100)} cm</div>
              </div>

              <div>
                <label className={labelCls}>Precio por metro lineal (MXN)</label>
                <input
                  type="number" min="1" step="1"
                  value={pricePerMeter}
                  onChange={e => setPricePerMeter(Math.max(1, parseFloat(e.target.value) || 1))}
                  className={inputCls}
                />
              </div>

              {/* Cost summary */}
              <div className="rounded border border-[#FFD400]/30 bg-black/30 divide-y divide-white/10 text-xs">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-white/60">Área total</span>
                  <span className="font-mono text-white">{areaM2} m²</span>
                </div>
                <div className="flex justify-between px-3 py-2">
                  <span className="text-white/60">Costo lineal ({metroLargo} m)</span>
                  <span className="font-mono text-white">${costoLineal} MXN</span>
                </div>
                <div className="flex justify-between px-3 py-2 bg-[#FFD400]/10">
                  <span className="text-[#FFD400] font-semibold">Total estimado</span>
                  <span className="font-mono font-bold text-[#FFD400]">${costoTotal} MXN</span>
                </div>
              </div>
              <div className="text-[10px] text-white/30 leading-relaxed">
                * El precio es un estimado basado en metros lineales. El costo real puede variar según el proveedor.
              </div>
            </div>
          )}

          {/* Design width */}
          <div>
            <label className={labelCls}>Ancho de diseño: {widthCm} cm · alto ≈ {realHeightCm} cm</label>
            <input
              type="range" min="3" max={maxDesignW} step="0.5"
              value={Math.min(widthCm, maxDesignW)}
              onChange={e => setWidthCm(+e.target.value)}
              className={rangeCls}
            />
          </div>

          {/* DPI */}
          <div>
            <label className={labelCls}>Resolución de salida (DPI)</label>
            <div className="flex gap-2">
              {[150,200,300,600].map(d => (
                <button key={d} onClick={()=>setDpi(d)} className={`flex-1 py-2 text-xs border rounded transition-colors ${dpi===d ? 'border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]' : 'border-white/15 text-white/70'}`}>{d}</button>
              ))}
            </div>
          </div>

          {/* Margin */}
          <div>
            <label className={labelCls}>Margen seguro: {margin} cm</label>
            <input type="range" min="0" max="3" step="0.5" value={margin} onChange={e=>setMargin(+e.target.value)} className={rangeCls}/>
          </div>

          {/* Background */}
          <div>
            <label className={labelCls}>Fondo</label>
            <div className="grid grid-cols-3 gap-2">
              {['transparent','white','black'].map(b => (
                <button key={b} onClick={()=>setBg(b)} className={`py-2 text-xs border rounded capitalize transition-colors ${bg===b ? 'border-[#00F0FF] bg-[#00F0FF]/10' : 'border-white/15 text-white/70'}`}>{b==='transparent'?'PNG':b}</button>
              ))}
            </div>
          </div>

          {/* Mirror */}
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input type="checkbox" checked={mirror} onChange={e=>setMirror(e.target.checked)} className="accent-[#00F0FF]"/>
            <span className="flex items-center gap-1"><FlipHorizontal size={14}/> Espejar (DTF film)</span>
          </label>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2">
            <button disabled={busy} onClick={download} className="nx-btn-primary px-4 py-3 flex items-center justify-center gap-2 text-xs">
              <Download size={14}/>Descargar PNG ({dpi} DPI)
            </button>
            {isAuthed ? (
              <button disabled={busy} onClick={save} className="nx-btn-ghost px-4 py-3 flex items-center justify-center gap-2 text-xs">
                <Save size={14}/>Guardar en mi panel
              </button>
            ) : (
              <Link to="/login" className="nx-btn-ghost px-4 py-3 text-center text-xs">Inicia sesión para guardar</Link>
            )}
            {msg && <div className="text-xs text-[#00F0FF]">{msg}</div>}
          </div>
        </div>
      }
    >
      {/* Canvas preview */}
      <div className="flex flex-col items-center gap-4">
        <div className="font-display text-xs tracking-widest text-white/60 uppercase">
          {isDtfMetro
            ? `DTF Metro · ${Math.round(metroAncho*100)}×${Math.round(metroLargo*100)} cm · ${dpi} DPI`
            : `${sheetKey} · ${sheet.w}×${sheet.h} cm · ${dpi} DPI`
          }
        </div>
        <div className="bg-black/50 p-4 rounded">
          <canvas ref={previewRef} className="block max-w-full" style={{ filter: img ? 'none' : 'opacity(0.7)' }}/>
        </div>
        {!img && (
          <div className="text-white/50 text-sm flex items-center gap-2"><Printer size={14}/> Sube una imagen PNG/JPG para previsualizar</div>
        )}
        {isDtfMetro && (
          <div className="flex items-center gap-2 text-xs text-[#FFD400]/70 border border-[#FFD400]/20 rounded px-3 py-2 bg-[#FFD400]/5">
            <Ruler size={12}/>
            <span>Rollo: {metroAncho} m × {metroLargo} m · Costo estimado: <strong className="text-[#FFD400]">${costoTotal} MXN</strong></span>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
