import React, { useState } from 'react';
import { UploadCloud, FileCheck2, AlertTriangle, Loader2, X } from 'lucide-react';
import { analyzeImageFile } from '@/lib/neonexa';

function toThumb(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(''); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/png')); } catch { resolve(''); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

export default function DtfUploader({ rules, onReady }) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // {file, analysis, thumb}

  const handle = async (file) => {
    if (!file) return;
    setBusy(true);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const okFormat = !rules?.formats || rules.formats.includes(ext);
    const okSize = !rules?.maxSizeMB || file.size <= rules.maxSizeMB * 1048576;
    const [analysis, thumb] = await Promise.all([analyzeImageFile(file), toThumb(file)]);
    const errs = [...(analysis.incidencias || [])];
    if (!okFormat) errs.unshift(`Formato .${ext} no permitido (${(rules.formats || []).join(', ')})`);
    if (!okSize) errs.unshift(`Archivo supera el límite de ${rules.maxSizeMB} MB`);
    const full = { ...analysis, incidencias: errs, valid: okFormat && okSize };
    setState({ file, analysis: full, thumb });
    onReady?.({ file, analysis: full, thumb });
    setBusy(false);
  };

  const reset = () => { setState(null); onReady?.(null); };

  if (state) {
    const a = state.analysis;
    return (
      <div className="nx-card p-5">
        <div className="flex gap-4">
          <div className="w-28 h-28 shrink-0 nx-checker rounded flex items-center justify-center overflow-hidden">
            {state.thumb ? <img src={state.thumb} alt="preview" className="max-w-full max-h-full object-contain"/> : <FileCheck2 size={40} className="text-[#00F0FF]"/>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold truncate">{a.name}</div>
              <button onClick={reset} className="text-white/50 hover:text-[#FF2D95]"><X size={16}/></button>
            </div>
            <div className="text-xs text-white/50 mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
              <span>Tipo: .{a.ext}</span>
              <span>Peso: {a.sizeMB} MB</span>
              {a.width && <span>Dim: {a.width}×{a.height}px</span>}
              <span>Transparencia: {a.hasAlpha == null ? 'n/d' : a.hasAlpha ? 'sí' : 'no'}</span>
            </div>
          </div>
        </div>
        {a.incidencias?.length > 0 ? (
          <div className="mt-4 space-y-1">
            {a.incidencias.map((i, k) => (
              <div key={k} className="flex items-start gap-2 text-sm text-[#FFD400]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0"/>{i}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#00F0FF]"><FileCheck2 size={15}/>Archivo analizado sin incidencias.</div>
        )}
      </div>
    );
  }

  return (
    <label className={`nx-card border-dashed border-2 border-[#00AEEF]/30 p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#00F0FF] transition ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
      <input type="file" className="hidden" accept={(rules?.formats || []).map(f => '.' + f).join(',')} onChange={e => handle(e.target.files?.[0])}/>
      {busy ? <Loader2 className="animate-spin text-[#00F0FF]" size={40}/> : <UploadCloud className="text-[#00AEEF]" size={40}/>}
      <div className="font-display uppercase tracking-widest mt-4">{busy ? 'Analizando…' : 'Sube tu archivo'}</div>
      <div className="text-white/50 text-sm mt-2">Formatos: {(rules?.formats || []).join(', ')} · máx {rules?.maxSizeMB || 50} MB</div>
    </label>
  );
}
