import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { labelCls, rangeCls } from '@/components/ToolShell';

export default function TransparencyCleanerTool() {
  return (
    <ImageToolLayout
      slug="transparency-cleaner"
      defaultParams={{ alphaThreshold: 60, removeWhite: true, whiteThreshold: 240 }}
      hint="Elimina píxeles semitransparentes, halos y bordes blancos no deseados."
      controls={(p, set) => (
        <>
          <label className="block">
            <span className={labelCls}>Umbral de transparencia: {p.alphaThreshold}</span>
            <input type="range" min="10" max="200" value={p.alphaThreshold} onChange={(e) => set({ alphaThreshold: +e.target.value })} className={rangeCls} />
          </label>
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" checked={p.removeWhite} onChange={(e) => set({ removeWhite: e.target.checked })} className="accent-[#00F0FF]" />
            Quitar bordes/halos blancos
          </label>
          {p.removeWhite && (
            <label className="block">
              <span className={labelCls}>Umbral de blanco: {p.whiteThreshold}</span>
              <input type="range" min="180" max="255" value={p.whiteThreshold} onChange={(e) => set({ whiteThreshold: +e.target.value })} className={rangeCls} />
            </label>
          )}
        </>
      )}
    />
  );
}
