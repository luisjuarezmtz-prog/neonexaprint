import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import { useAuth } from '@/lib/auth';
import { loadImageFile, loadImageUrl, downloadCanvas, saveDesign } from '@/lib/toolHelpers';
import { Upload, Download, Save, Shirt } from 'lucide-react';

const SHIRTS = [
  { id: 'black', label: 'Negra', url: 'https://images.hostinger.com/b951f346-3a73-4fc7-b1e0-fbc291cc5892.png' },
  { id: 'white', label: 'Blanca', url: 'https://images.hostinger.com/2e414043-c171-40ef-945a-cf788d2c99ce.png' },
];

export default function MockupTool() {
  const stageRef = useRef(null);
  const { isAuthed } = useAuth();
  const [shirt, setShirt] = useState(SHIRTS[0]);
  const [design, setDesign] = useState(null); // {dataUrl}
  const [pos, setPos] = useState({ x: 50, y: 38 }); // % of stage
  const [scale, setScale] = useState(28); // % width
  const [rotate, setRotate] = useState(0);
  const [opacity, setOpacity] = useState(100);
  const [title, setTitle] = useState('Mi mockup');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dragRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const { dataUrl } = await loadImageFile(f);
    setDesign({ dataUrl });
  };

  const startDrag = (e) => {
    if (!design) return;
    const rect = stageRef.current.getBoundingClientRect();
    const ev = e.touches?.[0] || e;
    dragRef.current = { rect, startX: ev.clientX, startY: ev.clientY, origX: pos.x, origY: pos.y };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('touchmove', onDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
  };
  const onDrag = (e) => {
    if (!dragRef.current) return;
    if (e.preventDefault) e.preventDefault();
    const ev = e.touches?.[0] || e;
    const { rect, startX, startY, origX, origY } = dragRef.current;
    const dx = ((ev.clientX - startX) / rect.width) * 100;
    const dy = ((ev.clientY - startY) / rect.height) * 100;
    setPos({ x: Math.max(0, Math.min(100, origX + dx)), y: Math.max(0, Math.min(100, origY + dy)) });
  };
  const endDrag = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchend', endDrag);
  };

  const compose = async () => {
    const shirtImg = await loadImageUrl(shirt.url);
    const c = document.createElement('canvas');
    c.width = shirtImg.naturalWidth || 1024;
    c.height = shirtImg.naturalHeight || 1024;
    const ctx = c.getContext('2d');
    ctx.drawImage(shirtImg, 0, 0, c.width, c.height);
    if (design) {
      const d = await loadImageUrl(design.dataUrl);
      const w = (scale / 100) * c.width;
      const ratio = d.naturalHeight / d.naturalWidth;
      const h = w * ratio;
      const cx = (pos.x / 100) * c.width;
      const cy = (pos.y / 100) * c.height;
      ctx.save();
      ctx.globalAlpha = opacity / 100;
      ctx.translate(cx, cy);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(d, -w/2, -h/2, w, h);
      ctx.restore();
    }
    return c;
  };

  const download = async () => {
    setBusy(true); setMsg('');
    try {
      const c = await compose();
      downloadCanvas(c, `${title || 'mockup'}.png`);
    } catch { setMsg('No se pudo exportar.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const c = await compose();
      const thumb = document.createElement('canvas');
      thumb.width = 400; thumb.height = 400;
      thumb.getContext('2d').drawImage(c, 0, 0, 400, 400);
      const dataUrl = thumb.toDataURL('image/jpeg', 0.7);
      await saveDesign({ title: title || 'Mockup', tool: 'mockup', thumbnail: dataUrl, config: { shirt: shirt.id, pos, scale, rotate, opacity } });
      setMsg('Guardado en tu panel.');
    } catch (e) { setMsg(e.message || 'Error al guardar.'); }
    finally { setBusy(false); }
  };

  return (
    <ToolShell
      eyebrow="HERRAMIENTA · MOCKUP STUDIO"
      title="Crea tu Mockup"
      subtitle="Sube tu diseño, arrástralo sobre la playera y ajusta. Exporta o guarda."
      sidebar={
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Nombre del diseño</label>
            <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Playera base</label>
            <div className="grid grid-cols-2 gap-2">
              {SHIRTS.map(s => (
                <button key={s.id} onClick={()=>setShirt(s)}
                  className={`p-2 rounded border text-xs ${shirt.id===s.id ? 'border-[#00F0FF] bg-[#00F0FF]/10' : 'border-white/10 hover:border-white/30'}`}>
                  <img src={s.url} className="w-full aspect-square object-cover rounded mb-2" alt=""/>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Tu diseño (PNG con transparencia recomendado)</label>
            <label className="nx-btn-ghost px-4 py-3 cursor-pointer inline-flex items-center gap-2 text-xs w-full justify-center">
              <Upload size={14}/> {design ? 'Cambiar imagen' : 'Subir imagen'}
              <input type="file" accept="image/*" hidden onChange={onFile}/>
            </label>
          </div>
          <div>
            <label className={labelCls}>Escala: {scale}%</label>
            <input type="range" min="5" max="80" value={scale} onChange={e=>setScale(+e.target.value)} className={rangeCls}/>
          </div>
          <div>
            <label className={labelCls}>Rotación: {rotate}°</label>
            <input type="range" min="-180" max="180" value={rotate} onChange={e=>setRotate(+e.target.value)} className={rangeCls}/>
          </div>
          <div>
            <label className={labelCls}>Opacidad: {opacity}%</label>
            <input type="range" min="10" max="100" value={opacity} onChange={e=>setOpacity(+e.target.value)} className={rangeCls}/>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button disabled={busy} onClick={download} className="nx-btn-primary px-4 py-3 flex items-center justify-center gap-2 text-xs"><Download size={14}/>Descargar PNG</button>
            {isAuthed ? (
              <button disabled={busy} onClick={save} className="nx-btn-ghost px-4 py-3 flex items-center justify-center gap-2 text-xs"><Save size={14}/>Guardar en mi panel</button>
            ) : (
              <Link to="/login" className="nx-btn-ghost px-4 py-3 text-center text-xs">Inicia sesión para guardar</Link>
            )}
            {msg && <div className="text-xs text-[#00F0FF]">{msg}</div>}
          </div>
        </div>
      }
    >
      <div ref={stageRef} className="relative w-full mx-auto bg-black/60 rounded overflow-hidden select-none"
           style={{ aspectRatio: '1 / 1', maxWidth: 700, touchAction: 'none' }}>
        <img src={shirt.url} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none"/>
        {design ? (
          <img
            src={design.dataUrl}
            alt=""
            draggable={false}
            onMouseDown={startDrag}
            onTouchStart={startDrag}
            className="absolute cursor-move"
            style={{
              left: `${pos.x}%`, top: `${pos.y}%`,
              width: `${scale}%`,
              transform: `translate(-50%,-50%) rotate(${rotate}deg)`,
              opacity: opacity/100,
              filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))'
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 pointer-events-none">
            <div className="bg-black/60 backdrop-blur px-6 py-5 rounded border border-[#00AEEF]/40">
              <Shirt className="mx-auto text-[#00F0FF] mb-3" size={28}/>
              <div className="font-display tracking-[0.3em] text-xs uppercase">Sube tu diseño para comenzar</div>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
