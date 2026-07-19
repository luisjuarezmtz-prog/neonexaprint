import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { removeBackground } from '@/lib/toolProcessors';
import { labelCls, rangeCls } from '@/components/ToolShell';

export default function BackgroundRemoverTool() {
  return (
    <ImageToolLayout
      slug="background-remover"
      defaultParams={{ tolerance: 40 }}
      process={removeBackground}
      hint="Funciona mejor con fondos sólidos. Genera un PNG transparente."
      controls={(p, set) => (
        <label className="block">
          <span className={labelCls}>Tolerancia de color: {p.tolerance}</span>
          <input type="range" min="10" max="120" value={p.tolerance} onChange={(e) => set({ tolerance: +e.target.value })} className={rangeCls} />
          <p className="text-white/40 text-[11px] mt-2">Sube el valor si quedan restos de fondo; bájalo si se borra el diseño.</p>
        </label>
      )}
    />
  );
}
