import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { smartHalftone } from '@/lib/toolProcessors';
import { labelCls, rangeCls } from '@/components/ToolShell';

const GARMENTS = ['#111111', '#ffffff', '#c0392b', '#1f4e8c', '#2e7d32', '#f1c40f', '#7f8c8d'];

export default function HalftoneSmartTool() {
  return (
    <ImageToolLayout
      slug="halftone-smart"
      defaultParams={{ cell: 8, angle: 45, garment: '#111111', lightGarment: false, ink: '#ffffff' }}
      process={smartHalftone}
      hint="Genera semitonos considerando el color de la prenda y la tinta."
      controls={(p, set) => (
        <>
          <label className="block">
            <span className={labelCls}>Tamaño de celda: {p.cell}px</span>
            <input type="range" min="4" max="20" value={p.cell} onChange={(e) => set({ cell: +e.target.value })} className={rangeCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Ángulo: {p.angle}°</span>
            <input type="range" min="0" max="90" value={p.angle} onChange={(e) => set({ angle: +e.target.value })} className={rangeCls} />
          </label>
          <div>
            <span className={labelCls}>Color de prenda</span>
            <div className="flex flex-wrap gap-2">
              {GARMENTS.map((g) => (
                <button key={g} onClick={() => set({ garment: g, lightGarment: g === '#ffffff' || g === '#f1c40f', ink: (g === '#ffffff' || g === '#f1c40f') ? '#000000' : '#ffffff' })}
                  className={`w-8 h-8 rounded-full border-2 ${p.garment === g ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: g }} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" checked={p.lightGarment} onChange={(e) => set({ lightGarment: e.target.checked, ink: e.target.checked ? '#000000' : '#ffffff' })} className="accent-[#00F0FF]" />
            Prenda clara (tinta oscura)
          </label>
        </>
      )}
    />
  );
}
