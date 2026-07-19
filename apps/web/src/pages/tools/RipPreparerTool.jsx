import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { prepareRip } from '@/lib/toolProcessors';
import { labelCls, rangeCls, inputCls } from '@/components/ToolShell';

const RIPS = ['Acrorip', 'Maintop', 'CADlink', 'Flexi', 'PrintFactory'];

export default function RipPreparerTool() {
  return (
    <ImageToolLayout
      slug="rip-preparer"
      defaultParams={{ rip: 'Acrorip', choke: 1, mirror: false }}
      process={prepareRip}
      hint="Genera base de blanco, preajustes y archivo de configuración para tu RIP."
      controls={(p, set) => (
        <>
          <label className="block">
            <span className={labelCls}>Flujo RIP</span>
            <select value={p.rip} onChange={(e) => set({ rip: e.target.value })} className={inputCls}>
              {RIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Choke de blanco: {p.choke}px</span>
            <input type="range" min="0" max="6" value={p.choke} onChange={(e) => set({ choke: +e.target.value })} className={rangeCls} />
          </label>
          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" checked={p.mirror} onChange={(e) => set({ mirror: e.target.checked })} className="accent-[#00F0FF]" />
            Espejo (para film DTF)
          </label>
        </>
      )}
    />
  );
}
