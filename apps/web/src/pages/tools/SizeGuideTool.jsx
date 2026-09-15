import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls } from '@/components/ToolShell';
import { recordJob, logUsage, logError, checkLimit, downloadDataURL, getJobResultUrl } from '@/lib/tools';
import {
  SIZE_GUIDES, MEASURE_REFERENCE_WIDTH_CM, MOCKUP_COLORS, BASE_PATHS,
  recolorMockupAsset, loadImageUrl, garmentScaleFor, visualPositionFor,
  effectiveDpiFor, designHeightCm, buildGuideSheet,
} from '@/lib/sizeGuideEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, Ruler, ShieldCheck, UploadCloud } from 'lucide-react';

const SLUG = 'size-guide';
const FACES = ['front', 'back'];
const FACE_LABEL = { front: 'PECHO', back: 'ESPALDA' };

export default function SizeGuideTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [garment, setGarment] = useState('shirt');
  const [profile, setProfile] = useState('men');
  const [unit, setUnit] = useState('cm');
  const [size, setSize] = useState('M');
  const [garmentWidth, setGarmentWidth] = useState(52);
  const [garmentHeight, setGarmentHeight] = useState(72);
  const [color, setColor] = useState('#111318');
  const [face, setFace] = useState('front');
  const [designs, setDesigns] = useState({});
  const [linked, setLinked] = useState(false);
  const [showSafe, setShowSafe] = useState(true);
  const [working, setWorking] = useState(false);
  const [bases, setBases] = useState(BASE_PATHS.shirt);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const designsRef = useRef(designs);
  designsRef.current = designs;

  const loadJobs = () => pb.collection('tool_jobs')
    .getList(1, 6, { filter: pb.filter('tool = {:t}', { t: SLUG }), sort: '-created' })
    .then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit(SLUG, planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const basePaths = BASE_PATHS[garment];
  useEffect(() => {
    let valid = true;
    Promise.all([recolorMockupAsset(basePaths.front, color, true), recolorMockupAsset(basePaths.back, color, true)])
      .then(([front, back]) => { if (valid) setBases({ front, back }); })
      .catch(() => { if (valid) setBases(basePaths); });
    return () => { valid = false; };
  }, [garment, color, basePaths.front, basePaths.back]);

  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(''), 2600); return () => clearTimeout(t); }, [note]);

  const currentSizes = SIZE_GUIDES[profile].sizes;
  const selectedSize = currentSizes.find((item) => item.size === size);
  const displayMeasure = (cm) => (unit === 'cm' ? cm : Number((cm / 2.54).toFixed(1)));
  const displayChest = (range) => {
    if (!range || unit === 'cm') return range;
    const values = range.match(/\d+/g)?.map(Number);
    return values?.length === 2 ? `${(values[0] / 2.54).toFixed(1)}–${(values[1] / 2.54).toFixed(1)} in` : range;
  };
  const measureSuffix = unit === 'cm' ? 'cm' : 'in';

  const scale = garmentScaleFor(garmentWidth, garmentHeight);
  const visualPosition = (value) => visualPositionFor(value, scale);
  const active = designs[face];

  const selectSize = (next) => {
    setSize(next);
    const preset = currentSizes.find((item) => item.size === next);
    if (preset) { setGarmentWidth(preset.width); setGarmentHeight(preset.height); }
  };
  const selectProfile = (next) => {
    const preferred = SIZE_GUIDES[next].sizes.find((item) => item.size === 'M') || SIZE_GUIDES[next].sizes[0];
    setProfile(next); setSize(preferred.size);
    setGarmentWidth(preferred.width); setGarmentHeight(preferred.height);
  };

  const upload = async (target, file) => {
    setErr('');
    if (!file || !file.type.startsWith('image/') || file.size > 50 * 1024 * 1024) {
      setErr('Usa PNG, JPG o WEBP de máximo 50 MB.');
      return;
    }
    try {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const image = await loadImageUrl(url);
      const next = { name: file.name, image, widthCm: 28, x: 50, y: garment === 'hoodie' && target === 'front' ? 39 : 42 };
      setDesigns((current) => ({
        ...current, [target]: next,
        ...(linked ? { [target === 'front' ? 'back' : 'front']: { ...next } } : {}),
      }));
      setFace(target);
      setNote(`Diseño cargado en ${target === 'front' ? 'pecho' : 'espalda'}`);
    } catch (e) { setErr(String(e.message || e)); }
  };

  const updateActive = (patch) => {
    if (!active) return;
    setDesigns((current) => {
      const other = face === 'front' ? 'back' : 'front';
      return {
        ...current, [face]: { ...current[face], ...patch },
        ...(linked && current[other] ? { [other]: { ...current[other], ...patch } } : {}),
      };
    });
  };

  // Arrastrar el diseño sobre la prenda. Se convierte de coordenadas de
  // pantalla a coordenadas de prenda dividiendo entre la escala, para que el
  // agarre siga al puntero aunque la talla encoja la prenda en la vista.
  const beginMove = (event, target) => {
    const design = designsRef.current[target];
    if (!design) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (pointer) => {
      const screenX = ((pointer.clientX - rect.left) / rect.width) * 100;
      const screenY = ((pointer.clientY - rect.top) / rect.height) * 100;
      const x = Math.max(24, Math.min(76, 50 + (screenX - 50) / scale));
      const y = Math.max(18, Math.min(72, 50 + (screenY - 50) / scale));
      setDesigns((current) => {
        const other = target === 'front' ? 'back' : 'front';
        if (!current[target]) return current;
        return {
          ...current, [target]: { ...current[target], x, y },
          ...(linked && current[other] ? { [other]: { ...current[other], x, y } } : {}),
        };
      });
    };
    const drag = (pointer) => position(pointer);
    const up = () => { window.removeEventListener('pointermove', drag); window.removeEventListener('pointerup', up); };
    position(event);
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', up, { once: true });
  };

  const effectiveDpi = effectiveDpiFor(active);

  const descargar = async () => {
    if (!designs.front && !designs.back) return;
    const chk = await checkLimit(SLUG, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setWorking(true);
    try {
      const blob = await buildGuideSheet({ garment, profile, size, garmentWidth, garmentHeight, bases, designs, scale });
      if (!blob) throw new Error('No se pudo generar la guía.');
      const name = `Guia_medidas_${garment}_${size}_Neonexa.png`;
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNote('Guía de medidas descargada');

      await recordJob({
        tool: SLUG, title: `Guía ${garment === 'shirt' ? 'playera' : 'sudadera'} ${size}`, status: 'done',
        params: { garment, profile, size, garmentWidth, garmentHeight, color, linked },
        result: { size, garmentWidth, garmentHeight, faces: Object.keys(designs), dpi: effectiveDpi },
        resultBlob: blob, resultFilename: name,
      });
      await logUsage(SLUG, 'run', { garment, size, profile });
      loadJobs();
    } catch (e) { setErr(String(e.message || e)); await logError(SLUG, e); }
    finally { setWorking(false); }
  };

  const sidebar = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="font-display uppercase tracking-widest text-xs text-white/60">1. Prenda y talla</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Prenda</span>
            <select value={garment} onChange={(e) => { setGarment(e.target.value); setDesigns({}); }} className={inputCls}>
              <option value="shirt">Playera</option>
              <option value="hoodie">Sudadera</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Tipo</span>
            <select value={profile} onChange={(e) => selectProfile(e.target.value)} className={inputCls}>
              {Object.keys(SIZE_GUIDES).map((item) => <option key={item} value={item}>{SIZE_GUIDES[item].label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Talla</span>
            <select value={size} onChange={(e) => selectSize(e.target.value)} className={inputCls}>
              {currentSizes.map((item) => <option key={item.size} value={item.size}>{item.size}</option>)}
              <option value="Personalizada">Personalizada</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Unidad</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls}>
              <option value="cm">Centímetros</option>
              <option value="in">Pulgadas</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Ancho A ({measureSuffix})</span>
            <input type="number" min={unit === 'cm' ? 20 : 8} max={unit === 'cm' ? 100 : 40} step={unit === 'cm' ? 0.5 : 0.1}
              value={displayMeasure(garmentWidth)} className={inputCls}
              onChange={(e) => { setGarmentWidth(unit === 'cm' ? Number(e.target.value) : Number(e.target.value) * 2.54); setSize('Personalizada'); }} />
          </label>
          <label className="block">
            <span className={labelCls}>Largo B ({measureSuffix})</span>
            <input type="number" min={unit === 'cm' ? 30 : 12} max={unit === 'cm' ? 120 : 48} step={unit === 'cm' ? 0.5 : 0.1}
              value={displayMeasure(garmentHeight)} className={inputCls}
              onChange={(e) => { setGarmentHeight(unit === 'cm' ? Number(e.target.value) : Number(e.target.value) * 2.54); setSize('Personalizada'); }} />
          </label>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">A · Ancho <span className="block text-[10px] text-white/35">De axila a axila</span></span>
            <b className="font-display">{displayMeasure(garmentWidth)} {measureSuffix}</b>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">B · Largo <span className="block text-[10px] text-white/35">Del hombro al borde inferior</span></span>
            <b className="font-display">{displayMeasure(garmentHeight)} {measureSuffix}</b>
          </div>
          {selectedSize?.chest && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
              <span className="text-white/50">Pecho recomendado</span>
              <b className="font-display text-[#00F0FF]">{displayChest(selectedSize.chest)}</b>
            </div>
          )}
          {selectedSize?.age && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/10">
              <span className="text-white/50">Edad</span><b className="font-display">{selectedSize.age}</b>
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 text-[11px] text-white/45 mt-3">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-[#3ddc84]" />
          <span><b className="text-white/70">Prenda extendida sobre una superficie plana.</b> Las medidas pueden variar ±1–2 cm según el fabricante.</span>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">2. Color de prenda</div>
        <div className="flex flex-wrap gap-2">
          {MOCKUP_COLORS.map((item) => (
            <button key={item} type="button" title={item} onClick={() => setColor(item)}
              className={`w-8 h-8 rounded-full border-2 ${color === item ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: item }} />
          ))}
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded-full border-2 border-white/20 bg-transparent p-0" />
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">3. Diseños</div>
        <div className="grid grid-cols-2 gap-2">
          {FACES.map((target) => (
            <label key={target} className="nx-btn-ghost py-3 text-center text-[11px] cursor-pointer inline-flex flex-col items-center gap-1">
              <UploadCloud size={16} className="text-[#00AEEF]" />
              {FACE_LABEL[target]}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => upload(target, e.target.files?.[0])} />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-white/70 mt-3">
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
          Sincronizar ambas caras
        </label>
        <label className="flex items-center gap-2 text-xs text-white/70 mt-2">
          <input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
          Mostrar zona imprimible
        </label>
      </div>

      {active && (
        <div className="pt-4 border-t border-white/10 space-y-3">
          <div className="font-display uppercase tracking-widest text-xs text-white/60">
            {face === 'front' ? 'Diseño de pecho' : 'Diseño de espalda'}
          </div>
          <label className="block">
            <span className={labelCls}>Ancho del diseño (cm)</span>
            <input type="number" min="2" max={garmentWidth * 0.8} step="0.5" value={active.widthCm} className={inputCls}
              onChange={(e) => updateActive({ widthCm: Number(e.target.value) })} />
          </label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/50">Largo calculado</span>
            <b className="font-display">{designHeightCm(active).toFixed(1)} cm</b>
          </div>
          <div className="nx-card p-3 flex items-center gap-3" style={{ color: effectiveDpi >= 200 ? '#3ddc84' : '#FFD400' }}>
            <ShieldCheck size={16} className="shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-sm">{effectiveDpi} DPI efectivos</div>
              <div className="text-[11px] opacity-80">{effectiveDpi >= 300 ? 'Calidad óptima' : effectiveDpi >= 200 ? 'Calidad aceptable' : 'Reduce el tamaño del diseño'}</div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-white/10 space-y-2">
        <div className="nx-card p-3 flex items-center gap-3">
          <Ruler size={16} className="text-[#00F0FF] shrink-0" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-white/45">Medida real de la prenda</div>
            <div className="font-display text-base">{garmentWidth.toFixed(1)} × {garmentHeight.toFixed(1)} cm</div>
          </div>
        </div>
        <button disabled={working || (!designs.front && !designs.back) || (limit && !limit.allowed)} onClick={descargar}
          className="nx-btn-primary w-full py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2" style={{ background: '#15805d' }}>
          {working ? 'Preparando…' : <><Download size={16}/>Descargar guía PNG</>}
        </button>
        {note && <div className="text-[#3ddc84] text-xs text-center">{note}</div>}
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        {limit && limit.remaining >= 0 && (
          <div className="text-[11px] text-white/40 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
        )}
        <p className="text-white/35 text-[10px] text-center">🔒 Las medidas se procesan en tu navegador</p>
      </div>

      {jobs.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 flex items-center gap-2"><History size={13}/>Historial</div>
          <div className="mt-3 space-y-1 text-xs text-white/60">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{j.title}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="text-white/35">{new Date(j.created).toLocaleDateString('es-MX')}</span>
                  {j.result_file && (
                    <button onClick={async () => { const url = await getJobResultUrl(j); if (url) window.open(url, '_blank'); }} title="Descargar" className="p-1 rounded text-white/40 hover:text-[#00F0FF] hover:bg-white/5">
                      <Download size={12}/>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolShell
      eyebrow="NEONEXA TOOLS"
      title="Neonexa Guía de Medidas"
      subtitle="Compara tallas a escala real: el diseño conserva su tamaño físico mientras la prenda crece o encoge, para ver de verdad cómo se verá impreso."
      sidebar={sidebar}
    >
      <div className="flex flex-col gap-5 h-full">
        <div className="grid sm:grid-cols-2 gap-4 flex-1">
          {FACES.map((target) => {
            const design = designs[target];
            return (
              <button key={target} type="button"
                onClick={() => setFace(target)}
                onPointerDown={(e) => { setFace(target); beginMove(e, target); }}
                className={`relative nx-checker rounded-lg overflow-hidden min-h-[320px] border-2 touch-none ${face === target ? 'border-[#00F0FF]' : 'border-white/10'}`}
                style={{ aspectRatio: '1 / 1' }}
                aria-label={`Vista ${FACE_LABEL[target].toLowerCase()}`}>
                <img src={bases[target]} alt={FACE_LABEL[target]} draggable="false"
                  className="absolute object-contain pointer-events-none"
                  style={{ left: '50%', top: '50%', width: `${scale * 100}%`, height: `${scale * 100}%`, transform: 'translate(-50%,-50%)' }} />
                {showSafe && (
                  <i className="absolute border-2 border-dashed border-[#00F0FF]/70 rounded pointer-events-none"
                    style={{ left: '50%', top: `${visualPosition(43)}%`, width: `${scale * 38}%`, height: `${scale * 43}%`, transform: 'translate(-50%,-50%)' }} />
                )}
                {design && (
                  <img src={design.image.src} alt="Diseño" draggable="false"
                    className="absolute pointer-events-none"
                    style={{ width: `${(design.widthCm / MEASURE_REFERENCE_WIDTH_CM) * 62}%`, left: `${visualPosition(design.x)}%`, top: `${visualPosition(design.y)}%`, transform: 'translate(-50%,-50%)' }} />
                )}
                <strong className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-display uppercase tracking-widest text-white/70">
                  {FACE_LABEL[target]}
                </strong>
                {working && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="animate-spin text-[#00AEEF]" size={24}/></div>}
              </button>
            );
          })}
        </div>
        <div className="nx-card p-3 text-[11px] text-white/45 shrink-0">
          Arrastra sobre la prenda para mover el diseño. Las tablas son referencias de playera, no fichas certificadas de cada fabricante;
          para sudadera verifica las medidas reales. La vista es una simulación, no un patrón de confección, y el PNG es una guía visual, no un archivo DTF a escala.
        </div>
      </div>
    </ToolShell>
  );
}
