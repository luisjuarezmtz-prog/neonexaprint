import React from 'react';
import ImageToolLayout from '@/components/tools/ImageToolLayout';
import { shirtSimulate } from '@/lib/toolProcessors';
import { labelCls } from '@/components/ToolShell';

const COLORS = ['#1a1a1a', '#ffffff', '#7f8c8d', '#c0392b', '#1f4e8c', '#2e7d32', '#8e44ad', '#e67e22'];

export default function ShirtSimulatorTool() {
  return (
    <ImageToolLayout
      slug="shirt-simulator"
      defaultParams={{ color: '#1a1a1a' }}
      process={shirtSimulate}
      hint="Previsualiza tu diseño sobre playeras de distintos colores. Ideal con PNG transparente."
      controls={(p, set) => (
        <div>
          <span className={labelCls}>Color de la playera</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => set({ color: c })}
                className={`w-9 h-9 rounded-full border-2 ${p.color === c ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: c }} />
            ))}
          </div>
        </div>
      )}
    />
  );
}
