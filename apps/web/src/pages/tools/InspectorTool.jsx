import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { inspect } from '@/lib/toolProcessors';
import { labelCls, inputCls, rangeCls } from '@/components/ToolShell';

export default function InspectorTool() {
  return (
    <ImageToolLayout
      slug="inspector"
      defaultParams={{ printCm: 30, minDpi: 150 }}
      process={inspect}
      hint="PNG, JPG o WEBP. Analizamos resolución, DPI, transparencia y bordes."
      controls={(p, set) => (
        <>
          <label className="block">
            <span className={labelCls}>Ancho de impresión: {p.printCm} cm</span>
            <input type="range" min="5" max="120" value={p.printCm} onChange={(e) => set({ printCm: +e.target.value })} className={rangeCls} />
          </label>
          <label className="block">
            <span className={labelCls}>DPI mínimo aceptable</span>
            <input type="number" value={p.minDpi} onChange={(e) => set({ minDpi: +e.target.value })} className={inputCls} />
          </label>
        </>
      )}
    />
  );
}
