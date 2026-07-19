import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { labelCls, rangeCls } from '@/components/ToolShell';

export default function UpscalerTool() {
  return (
    <ImageToolLayout
      slug="upscaler"
      defaultParams={{ factor: 2, sharpness: 50 }}
      hint="Aumenta la resolución con reconstrucción y nitidez para DTF."
      controls={(p, set) => (
        <>
          <div>
            <span className={labelCls}>Factor de escalado</span>
            <div className="flex gap-2">
              {[2, 3, 4].map((f) => (
                <button key={f} onClick={() => set({ factor: f })}
                  className={`flex-1 py-2 rounded text-sm font-display ${p.factor === f ? 'nx-btn-primary' : 'nx-btn-ghost'}`}>{f}×</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={labelCls}>Nitidez: {p.sharpness}%</span>
            <input type="range" min="0" max="100" value={p.sharpness} onChange={(e) => set({ sharpness: +e.target.value })} className={rangeCls} />
          </label>
        </>
      )}
    />
  );
}
