import React, { useEffect, useRef, useState } from 'react';
import ToolShell, { labelCls, inputCls, rangeCls } from '@/components/ToolShell';
import Dropzone from '@/components/tools/Dropzone';
import { loadImageFromFile, recordJob, logUsage, logError, checkLimit, downloadDataURL, makeThumb, getJobResultUrl } from '@/lib/tools';
import { analyze, dpiAtWidth, buildReport } from '@/lib/inspectorEngine';
import { useMembership } from '@/lib/membership';
import pb from '@/lib/pocketbaseClient';
import { History, Download, Loader2, FileText, AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';

const SLUG = 'inspector';

const NOTE_STYLE = {
  bad:  { color: '#FF2D95', bg: 'rgba(255,45,149,0.1)', Icon: AlertOctagon },
  warn: { color: '#FFD400', bg: 'rgba(255,212,0,0.1)', Icon: AlertTriangle },
  ok:   { color: '#3ddc84', bg: 'rgba(61,220,132,0.1)', Icon: CheckCircle2 },
};

export default function InspectorTool() {
  const { membership } = useMembership();
  const planName = membership?.expand?.plan?.name;

  const [printCm, setPrintCm] = useState(30);
  const [minDpi, setMinDpi] = useState(150);

  const [fileName, setFileName] = useState('');
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { metrics, notes, counts, width, height }
  const [err, setErr] = useState('');
  const [jobs, setJobs] = useState([]);
  const [limit, setLimit] = useState(null);

  const imgRef = useRef(null);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);

  const loadJobs = () => pb.collection('tool_jobs')
    .getList(1, 6, { filter: pb.filter('tool = {:t}', { t: SLUG }), sort: '-created' })
    .then((r) => setJobs(r.items)).catch(() => {});
  useEffect(() => { loadJobs(); checkLimit(SLUG, planName).then(setLimit); /* eslint-disable-next-line */ }, [planName]);

  const draw = (source) => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
  };

  const onFile = async (file) => {
    setErr('');
    try {
      const { img } = await loadImageFromFile(file);
      imgRef.current = img;
      fileRef.current = file;
      setFileName(file.name.replace(/\.[^.]+$/, ''));
      setMeta({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, name: file.name });
      setReport(null);
      setReady(true);
    } catch (e) { setErr(String(e.message || e)); }
  };

  // El <canvas> se monta junto con ready=true; dibujar en el mismo tick
  // apuntaría a una ref nula, así que el primer trazo va en el efecto.
  useEffect(() => { if (ready && imgRef.current) draw(imgRef.current); /* eslint-disable-next-line */ }, [ready]);

  const revisar = async () => {
    if (!imgRef.current || !fileRef.current) return;
    const chk = await checkLimit(SLUG, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setErr(''); setBusy(true);
    try {
      const r = analyze(imgRef.current, fileRef.current);
      setReport(r);
      const dpi = dpiAtWidth(r.width, printCm);
      const txt = buildReport({ fileName: fileRef.current.name, metrics: r.metrics, notes: r.notes, printCm, dpi, minDpi });
      const blob = new Blob([txt], { type: 'text/plain' });
      await recordJob({
        tool: SLUG, title: `Inspección ${fileName || 'diseño'}`, status: 'done',
        inputName: meta?.name, inputPreview: makeThumb(imgRef.current),
        params: { printCm, minDpi },
        result: { width: r.width, height: r.height, dpi, ...r.counts, alerts: r.notes.map((n) => n[1]) },
        resultBlob: blob, resultFilename: `reporte-neonexa-${fileName || 'diseno'}.txt`,
      });
      await logUsage(SLUG, 'run', { printCm });
      loadJobs();
    } catch (e) { setErr(String(e.message || e)); await logError(SLUG, e); }
    finally { setBusy(false); }
  };

  const descargarReporte = () => {
    if (!report) return;
    const dpi = dpiAtWidth(report.width, printCm);
    const txt = buildReport({ fileName: fileRef.current?.name || fileName, metrics: report.metrics, notes: report.notes, printCm, dpi, minDpi });
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    downloadDataURL(url, `reporte-neonexa-${fileName || 'diseno'}.txt`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const cambiarImagen = () => {
    imgRef.current = null; fileRef.current = null;
    setReady(false); setFileName(''); setMeta(null); setReport(null); setErr('');
  };

  // El DPI se recalcula al mover el control, sin volver a recorrer la imagen.
  const dpi = report ? dpiAtWidth(report.width, printCm) : null;
  const dpiLow = dpi != null && dpi < minDpi;

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-xs text-white/60 mb-3">Tamaño de impresión</div>
        <p className="text-white/40 text-[11px] mb-3">El reporte del módulo indica el ancho que da a 300 DPI. Esto responde la pregunta inversa: al ancho que vas a imprimir, ¿con cuántos DPI queda?</p>
        <label className="block">
          <span className={labelCls}>Ancho de impresión: {printCm} cm</span>
          <input type="range" min="5" max="120" value={printCm} onChange={(e) => setPrintCm(+e.target.value)} className={rangeCls} />
        </label>
        <label className="block mt-4">
          <span className={labelCls}>DPI mínimo aceptable</span>
          <input type="number" min="30" max="1200" value={minDpi} onChange={(e) => setMinDpi(+e.target.value || 30)} className={inputCls} />
        </label>
        {dpi != null && (
          <div className="nx-card p-3 mt-4 flex items-center justify-between">
            <span className="text-[11px] text-white/50">A {printCm} cm de ancho</span>
            <span className="font-display text-lg" style={{ color: dpiLow ? '#FFD400' : '#3ddc84' }}>{dpi} DPI</span>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="nx-card p-3 space-y-1.5 text-[11px] text-[#3ddc84]">
          <div>✓ Análisis a resolución completa</div>
          <div>✓ El original nunca se modifica</div>
          <div>✓ Todo ocurre en tu navegador</div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button disabled={!ready || busy || (limit && !limit.allowed)} onClick={revisar} className="nx-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Revisando…' : 'Revisar diseño'}
        </button>
        <button disabled={!report} onClick={descargarReporte} className="nx-btn-primary w-full py-3 disabled:opacity-40 inline-flex items-center justify-center gap-2" style={{ background: '#15805d' }}>
          <FileText size={16}/>Descargar reporte TXT
        </button>
        {ready && <button onClick={cambiarImagen} className="text-white/40 text-xs w-full text-center hover:text-white/70">Cambiar imagen</button>}
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
                    <button onClick={async () => { const url = await getJobResultUrl(j); if (url) window.open(url, '_blank'); }} title="Descargar reporte" className="p-1 rounded text-white/40 hover:text-[#00F0FF] hover:bg-white/5">
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
      title="Neonexa Inspector"
      subtitle="Revisa resolución, transparencias, halos y bordes antes de mandar a imprimir, y llévate el reporte en TXT."
      sidebar={sidebar}
    >
      <div className="flex flex-col gap-5 h-full">
        {!ready && <Dropzone onFile={onFile} hint="PNG, JPG o WEBP. El análisis ocurre en tu navegador; el original nunca se modifica." />}
        {ready && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-white/50 truncate">{meta?.name}{meta ? ` · ${meta.w} × ${meta.h}px` : ''}</div>
              {!report && !busy && <div className="text-xs text-white/40">Pulsa “Revisar diseño”</div>}
            </div>

            <div className="nx-checker rounded-lg overflow-auto flex-1 min-h-[260px] p-2 flex items-center justify-center relative">
              {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><Loader2 className="animate-spin text-[#00AEEF]" size={28}/></div>}
              <canvas ref={canvasRef} className="max-w-full max-h-[340px]" />
            </div>

            {report && (
              <div className="space-y-4 shrink-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {report.metrics.map(([label, value]) => (
                    <div key={label} className="nx-card px-4 py-3">
                      <div className="text-[10px] uppercase tracking-widest text-white/45">{label}</div>
                      <div className="font-display text-base mt-0.5">{value}</div>
                    </div>
                  ))}
                  <div className="nx-card px-4 py-3">
                    <div className="text-[10px] uppercase tracking-widest text-white/45">DPI a {printCm} cm</div>
                    <div className="font-display text-base mt-0.5" style={{ color: dpiLow ? '#FFD400' : '#3ddc84' }}>{dpi}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {dpiLow && (
                    <div className="flex items-start gap-2 text-sm px-4 py-3 rounded" style={{ color: '#FFD400', background: 'rgba(255,212,0,0.1)' }}>
                      <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                      <span>A {printCm} cm quedaría en {dpi} DPI, por debajo del mínimo de {minDpi} que pediste.</span>
                    </div>
                  )}
                  {report.notes.map(([kind, text], i) => {
                    const s = NOTE_STYLE[kind] || NOTE_STYLE.ok;
                    return (
                      <div key={i} className="flex items-start gap-2 text-sm px-4 py-3 rounded" style={{ color: s.color, background: s.bg }}>
                        <s.Icon size={16} className="shrink-0 mt-0.5"/><span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ToolShell>
  );
}
