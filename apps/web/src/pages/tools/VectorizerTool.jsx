import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { labelCls, rangeCls } from '@/components/ToolShell';

export default function VectorizerTool() {
  return (
    <ImageToolLayout
      slug="vectorizer"
      defaultParams={{ colors: 6 }}
      hint="Convierte tu PNG/JPG a un SVG editable por regiones de color."
      controls={(p, set) => (
        <label className="block">
          <span className={labelCls}>Cantidad de colores: {p.colors}</span>
          <input type="range" min="2" max="16" value={p.colors} onChange={(e) => set({ colors: +e.target.value })} className={rangeCls} />
          <p className="text-white/40 text-[11px] mt-2">El resultado se descarga como archivo SVG vectorial.</p>
        </label>
      )}
    />
  );
}
