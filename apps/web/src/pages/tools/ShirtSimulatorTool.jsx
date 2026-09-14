import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import {
  PRODUCTS, FORMATS, GARMENT_COLORS, NATIVE_GARMENT,
  recolorGarment, removeConnectedBackground, layout, composeMockup,
} from '@/lib/mockupEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, RotateCcw, Check } from 'lucide-react';

const SLUG = 'shirt-simulator';
const PRODUCT_KEYS = Object.keys(PRODUCTS);

export default function ShirtSimulatorTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [kind, setKind] = useState('shirt-front');
  const [format, setFormat] = useState('square');
  const [background, setBackground] = useState('#ececf0');
  const [garmentColor, setGarmentColor] = useState(NATIVE_GARMENT);

  const [scale, setScale] = useState(PRODUCTS['shirt-front'].scale);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(96);
  const [showSafe, setShowSafe] = useState(true);
  const [removeBg, setRemoveBg] = useState(false);

  const [baseSrc, setBaseSrc] = useState(PRODUCTS['shirt-front'].src);
  const [designSrc, setDesignSrc] = useState('');
  const [fileName, setFileName] = useState('');
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const designImgRef = useRef(null);
  const designUrlRef = useRef('');

  const product = PRODUCTS[kind];

  const loadJobs = () => pb.collection('tool_jobs')
    .getList(1, 6, { filter: pb.filter('tool = {:t}', { t: SLUG }), sort: '-created' })
    .then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit(SLUG, planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  useEffect(() => () => { if (designUrlRef.current) URL.revokeObjectURL(designUrlRef.current); }, []);

  // Re-tint the garment whenever the product or the colour changes. The recolor
  // walks every pixel of a 1280×1280 bitmap, so a colour clicked twice in a row
  // is served from the cache instead of being recomputed.
  const tintCache = useRef(new Map());
  useEffect(() => {
    let cancelled = false;
    const key = `${kind}|${garmentColor}`;
    const cached = tintCache.current.get(key);
    if (cached) { setBaseSrc(cached); return undefined; }
    recolorGarment(PRODUCTS[kind], garmentColor)
      .then((src) => { if (cancelled) return; tintCache.current.set(key, src); setBaseSrc(src); })
      .catch(() => { if (!cancelled) setBaseSrc(PRODUCTS[kind].src); });
    return () => { cancelled = true; };
  }, [kind, garmentColor]);

  const applyDesign = (strip) => {
    const img = designImgRef.current;
    if (!img) return;
    setDesignSrc(strip ? removeConnectedBackground(img) : designUrlRef.current);
  };

  const onFile = async (file) => {
    setErr('');
    try {
      const { img, url } = await loadImageFromFile(file);
      if (designUrlRef.current) URL.revokeObjectURL(designUrlRef.current);
      designImgRef.current = img;
      designUrlRef.current = url;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setMeta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, name: file.name });
      setDesignSrc(removeBg ? removeConnectedBackground(img) : url);
      setReady(true);
    } catch (e) { setErr(String(e.message || e)); }
  };

  const chooseProduct = (next) => {
    setKind(next);
    setScale(PRODUCTS[next].scale);
    setOffsetX(0); setOffsetY(0); setRotation(0);
  };

  const resetPlacement = () => {
    setScale(product.scale);
    setOffsetX(0); setOffsetY(0); setRotation(0); setOpacity(96);
  };

  const cambiarDiseno = () => {
    if (designUrlRef.current) URL.revokeObjectURL(designUrlRef.current);
    designImgRef.current = null; designUrlRef.current = '';
    setReady(false); setDesignSrc(''); setFileName(''); setMeta(null); setErr('');
  };

  const descargar = async () => {
    if (!designSrc) return;
    const chk = await checkLimit(SLUG, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setBusy(true);
    try {
      const params = { kind, format, background, garmentColor, scale, offsetX, offsetY, rotation, opacity, removeBg };
      const blob = await composeMockup({ baseSrc, designSrc, product, format, background, scale, offsetX, offsetY, rotation, opacity });
      const name = `Neonexa_mockup_${fileName || kind}_${kind}_${format}.png`;
      const url = URL.createObjectURL(blob);
      downloadDataURL(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      await recordJob({
        tool: SLUG, title: `Mockup ${product.label}`, status: 'done',
        inputName: meta?.name, inputPreview: designImgRef.current ? makeThumb(designImgRef.current) : '',
        params, result: { product: kind, format, width: FORMATS[format].w, height: FORMATS[format].h },
        resultBlob: blob, resultFilename: name,
      });
      await logUsage(SLUG, 'run', { product: kind, format });
      loadJobs();
    } catch (e) { setErr(String(e.message || e)); await logError(SLUG, e); }
    finally { setBusy(false); }
  };

  const place = layout({ product, scale, offsetX, offsetY });

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">1. Producto</div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRODUCT_KEYS.map((key) => (
            <button key={key} type="button" onClick={() => chooseProduct(key)}
              className={`min-h-[48px] px-2 py-1.5 rounded border text-[11px] leading-tight ${kind === key ? 'border-[#00F0FF] bg-[#00AEEF]/15 text-white' : 'border-white/15 text-white/60 hover:border-white/30'}`}>
              {PRODUCTS[key].label}
            </button>
          ))}
        </div>
      </div>

      {product.tint && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">2. Color de la prenda</div>
          <p className="text-white/40 text-[11px] mb-3">El color cambia conservando las luces y las sombras de la prenda.</p>
          <div className="flex flex-wrap gap-2">
            {GARMENT_COLORS.map((c) => (
              <button key={c} type="button" title={c} onClick={() => setGarmentColor(c)}
                className={`w-8 h-8 rounded-full border-2 ${garmentColor === c ? 'border-[#00F0FF]' : 'border-white/20'}`} style={{ background: c }} />
            ))}
            <input type="color" value={garmentColor} onChange={(e) => setGarmentColor(e.target.value)}
              className="w-8 h-8 rounded-full border-2 border-white/20 bg-transparent p-0" title="Color personalizado" />
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-white/10 space-y-4">
        <div className="font-display uppercase tracking-widest text-xs text-white/60">3. Presentación</div>
        <label className="block">
          <span className={labelCls}>Formato de salida</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputCls}>
            {Object.entries(FORMATS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className={`${labelCls} mb-0`}>Fondo</span>
          <input type="color" value={background} onChange={(e) => setBackground(e.target.value)}
            className="w-10 h-8 rounded border border-white/20 bg-transparent p-0" />
        </label>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-4">
        <div className="font-display uppercase tracking-widest text-xs text-white/60">4. Diseño</div>
        <label className="nx-card p-3 flex items-center justify-between gap-3 cursor-pointer">
          <span className="min-w-0">
            <span className="block text-xs font-display uppercase tracking-wide">Eliminar fondo del diseño</span>
            <span className="block text-[11px] text-white/40 mt-0.5">Solo quita el fondo conectado a las orillas.</span>
          </span>
          <input type="checkbox" checked={removeBg} disabled={!ready}
            onChange={(e) => { setRemoveBg(e.target.checked); applyDesign(e.target.checked); }}
            className="w-4 h-4 accent-[#00F0FF] shrink-0" />
        </label>
        <label className="block">
          <span className={labelCls}>Tamaño: {scale}%</span>
          <input type="range" min="12" max="55" value={scale} onChange={(e) => setScale(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Posición horizontal: {offsetX}</span>
          <input type="range" min="-20" max="20" value={offsetX} onChange={(e) => setOffsetX(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Posición vertical: {offsetY}</span>
          <input type="range" min="-18" max="18" value={offsetY} onChange={(e) => setOffsetY(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Rotación: {rotation}°</span>
          <input type="range" min="-30" max="30" value={rotation} onChange={(e) => setRotation(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Intensidad: {opacity}%</span>
          <input type="range" min="55" max="100" value={opacity} onChange={(e) => setOpacity(+e.target.value)} className={rangeCls} />
        </label>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={showSafe} onChange={(e) => setShowSafe(e.target.checked)} className="w-4 h-4 accent-[#00F0FF]" />
          Mostrar zona segura
        </label>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-1.5 text-[11px] text-[#3ddc84]">
          <div>✓ Todo se procesa en tu navegador</div>
          <div>✓ El diseño original nunca se modifica</div>
          <div>✓ Descarga en PNG listo para publicar</div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || busy || (limit && !limit.allowed)} onClick={descargar} className="nx-btn-primary w-full py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2">
          {busy ? 'Generando mockup…' : <><Download size={16}/>Descargar mockup PNG</>}
        </button>
        <button onClick={resetPlacement} className="nx-btn-ghost w-full py-2.5 inline-flex items-center justify-center gap-2"><RotateCcw size={14}/>Restablecer posición</button>
        {ready && <button onClick={cambiarDiseno} className="text-white/40 text-xs w-full text-center hover:text-white/70">Cambiar diseño</button>}
        {err && <div role="alert" className="text-[#FF2D95] text-sm">{err}</div>}
        {limit && limit.remaining >= 0 && (
          <div className="text-[11px] text-white/40 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
        )}
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
      title="Neonexa Mockups"
      subtitle="Coloca tu diseño sobre playeras, sudaderas y tazas reales, cambia el color de la prenda y descarga el mockup listo para cotizar o publicar."
      sidebar={sidebar}
    >
      <div className="flex flex-col gap-5 h-full">
        {!ready && <Dropzone onFile={onFile} hint="PNG, JPG o WEBP. El archivo original nunca se modifica." />}
        {ready && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Check size={14} className="text-[#3ddc84]" />
                {product.label} · {FORMATS[format].label}
              </div>
              <div className="text-xs text-white/50 truncate">{meta?.name}{meta ? ` · ${meta.w} × ${meta.h}px` : ''}</div>
            </div>

            <div className="flex-1 min-h-[420px] flex items-center justify-center relative">
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 rounded-lg"><Loader2 className="animate-spin text-[#00AEEF]" size={28}/></div>}
              {/* The stage carries the output aspect ratio; the square inside it
                  mirrors composeMockup()'s centered square, so what is placed
                  here lands on exactly the same spot in the exported PNG. */}
              <div
                className="relative rounded-lg overflow-hidden border border-white/10 max-h-full"
                style={{ background, aspectRatio: `${FORMATS[format].w} / ${FORMATS[format].h}`, width: 'min(100%, 560px)' }}
              >
                <div className="absolute left-0 w-full top-1/2 -translate-y-1/2" style={{ aspectRatio: '1 / 1' }}>
                  <img src={baseSrc} alt={product.label} className="absolute inset-0 w-full h-full object-contain" />
                  {showSafe && (
                    <div
                      className="absolute z-10 border-2 border-dashed border-[#00F0FF]/70 rounded grid place-items-end justify-center text-[10px] text-[#00F0FF] pointer-events-none"
                      style={{ left: `${product.x}%`, top: `${product.y}%`, width: '38%', height: '42%', transform: 'translate(-50%,-50%)' }}
                    >
                      Área imprimible
                    </div>
                  )}
                  <img
                    src={designSrc} alt="Diseño"
                    className="absolute z-[15] h-auto"
                    style={{
                      width: `${place.width}%`, left: `${place.left}%`, top: `${place.top}%`,
                      opacity: opacity / 100,
                      transform: `translate(-50%,-50%) rotate(${rotation}deg)`,
                      transformOrigin: 'center',
                      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.33))',
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="nx-card p-3 flex flex-wrap items-center justify-center gap-6 text-xs text-white/50 shrink-0">
              <span>Salida <b className="text-[#00F0FF]">{FORMATS[format].w} × {FORMATS[format].h}px</b></span>
              <span>Procesamiento local · sin API</span>
            </div>
          </>
        )}
      </div>
    </ToolShell>
  );
}
