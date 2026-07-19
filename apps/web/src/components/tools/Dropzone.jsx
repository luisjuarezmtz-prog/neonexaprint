import React, { useCallback, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function Dropzone({ onFile, accept = 'image/*', multiple = false, onFiles, hint }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const handle = useCallback((files) => {
    const list = Array.from(files || []);
    if (list.length === 0) return;
    if (multiple && onFiles) onFiles(list);
    else if (onFile) onFile(list[0]);
  }, [multiple, onFile, onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed transition p-10 text-center ${drag ? 'border-[#00F0FF] bg-[#00AEEF]/10' : 'border-[#00AEEF]/30 hover:border-[#00AEEF]/60'}`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
        onChange={(e) => handle(e.target.files)} />
      <UploadCloud className="mx-auto text-[#00AEEF]" size={40} />
      <div className="font-display uppercase tracking-widest mt-4 text-sm">Arrastra y suelta{multiple ? ' tus diseños' : ' tu archivo'}</div>
      <div className="text-white/50 text-xs mt-1">o haz clic para seleccionar</div>
      {hint && <div className="text-white/35 text-[11px] mt-3">{hint}</div>}
    </div>
  );
}
