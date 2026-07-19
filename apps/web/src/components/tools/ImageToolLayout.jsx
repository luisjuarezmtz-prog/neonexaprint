import React, { useEffect, useRef, useState } from 'react';
import ToolShell from '@/components/ToolShell';
import Dropzone from './Dropzone';
import { useMembership } from '@/lib/membership';
import { loadImageFromFile, makeThumb, recordJob, logUsage, logError, checkLimit, downloadDataURL, getJobResultUrl, toolBySlug } from '@/lib/tools';
import pb from '@/lib/pocketbaseClient';
import { Loader2, Download, RotateCcw, History, AlertTriangle } from 'lucide-react';

/**
 * Generic image tool workspace. Processing runs in a Web Worker (workers/imageProcessor.worker.js,
 * dispatched by `slug`) so a heavy per-pixel loop never freezes the page.
 */
export default function ImageToolLayout({ slug, controls, defaultParams = {}, hint, accept = 'image/png,image/jpeg,image/webp' }) {
  const tool = toolBySlug(slug);
  const { membership } = useMembership();
  const [file, setFile] = useState(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [img, setImg] = useState(null);
  const [params, setParams] = useState(defaultParams);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [out, setOut] = useState(null); // { outputBlob, outUrl, result, downloadName, summary, download? }
  const [err, setErr] = useState('');
  const [limit, setLimit] = useState(null);
  const [jobs, setJobs] = useState([]);
  const workerRef = useRef(null);

  const planName = membership?.expand?.plan?.name;

  const loadJobs = () => {
    pb.collection('tool_jobs').getList(1, 8, { filter: pb.filter('tool = {:t}', { t: slug }), sort: '-created' })
      .then((r) => setJobs(r.items)).catch(() => {});
  };
  useEffect(() => { loadJobs(); checkLimit(slug, planName).then(setLimit); /* eslint-disable-next-line */ }, [slug, planName]);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  const reset = () => {
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (out?.outUrl) URL.revokeObjectURL(out.outUrl);
    setFile(null); setSrcUrl(''); setImg(null); setOut(null); setErr(''); setProgress(0);
  };

  const onFile = async (f) => {
    reset(); setErr('');
    try {
      const { img: image, url } = await loadImageFromFile(f);
      setFile(f); setImg(image); setSrcUrl(url); setOut(null);
    } catch (e) { setErr(String(e.message || e)); }
  };

  const runInWorker = (bitmap) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/imageProcessor.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'progress') setProgress(Math.min(99, Math.round(e.data.value)));
      else if (type === 'done') { worker.terminate(); resolve(e.data.result); }
      else if (type === 'error') { worker.terminate(); reject(new Error(e.data.message)); }
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Error en el procesamiento.')); };
    worker.postMessage({ tool: slug, bitmap, params }, [bitmap]);
  });

  const run = async () => {
    if (!img) return;
    const chk = await checkLimit(slug, planName);
    setLimit(chk);
    if (!chk.allowed) { setErr(chk.reason || 'Alcanzaste el límite mensual de tu plan para esta herramienta.'); return; }
    setBusy(true); setErr(''); setProgress(5); setOut(null);
    try {
      const bitmap = await createImageBitmap(file);
      const result = await runInWorker(bitmap);
      setProgress(100);
      const outUrl = URL.createObjectURL(result.outputBlob);
      setOut({ ...result, outUrl });

      const thumbIn = makeThumb(img);
      let thumbOut = '';
      try {
        const outBitmap = await createImageBitmap(result.outputBlob);
        thumbOut = makeThumb(outBitmap);
        outBitmap.close?.();
      } catch { /* ignore, e.g. SVG blobs createImageBitmap may not decode in every browser */ }

      const downloadName = result.downloadName || `neonexa-${slug}.png`;
      const deliverable = result.download || { blob: result.outputBlob, name: downloadName };
      await recordJob({
        tool: slug, title: file?.name || tool?.name, status: 'done',
        inputName: file?.name, inputPreview: thumbIn, outputPreview: thumbOut,
        params, result: result.result || {},
        resultBlob: deliverable.blob, resultFilename: deliverable.name,
      });
      await logUsage(slug, 'run', { name: file?.name });
      loadJobs();
    } catch (e) {
      setErr(String(e.message || e));
      await recordJob({ tool: slug, title: file?.name, status: 'error', inputName: file?.name, error: String(e.message || e) });
      await logError(slug, e, { name: file?.name });
    } finally { setBusy(false); }
  };

  const download = () => {
    const deliverable = out?.download || (out?.outputBlob ? { blob: out.outputBlob, name: out.downloadName || `neonexa-${slug}.png` } : null);
    if (!deliverable) return;
    const url = URL.createObjectURL(deliverable.blob);
    downloadDataURL(url, deliverable.name);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const canDownload = !!(out?.outputBlob || out?.download);

  const sidebar = (
    <div className="space-y-6">
      <div>
        <div className="font-display uppercase tracking-widest text-sm text-[#00F0FF]">Parámetros</div>
        <div className="mt-4 space-y-4">{controls ? controls(params, (patch) => setParams((p) => ({ ...p, ...patch }))) : <p className="text-white/50 text-sm">Sin parámetros. Sube tu archivo y procesa.</p>}</div>
      </div>
      <div className="pt-4 border-t border-white/10">
        <button disabled={!img || busy} onClick={run} className="nx-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Procesando…' : 'Procesar'}
        </button>
        {canDownload && (
          <button onClick={download} className="nx-btn-ghost w-full py-3 mt-3 inline-flex items-center justify-center gap-2"><Download size={16}/>Descargar resultado</button>
        )}
        {(file || out) && <button onClick={reset} className="w-full py-2 mt-2 text-white/50 text-xs uppercase tracking-widest inline-flex items-center justify-center gap-2"><RotateCcw size={12}/>Nuevo trabajo</button>}
        {limit && limit.remaining >= 0 && (
          <div className="text-[11px] text-white/40 mt-3 text-center">{limit.remaining} usos restantes este mes{limit.max ? ` de ${limit.max}` : ''}</div>
        )}
      </div>
      {jobs.length > 0 && (
        <div className="pt-4 border-t border-white/10">
          <div className="font-display uppercase tracking-widest text-xs text-white/60 flex items-center gap-2"><History size={13}/>Historial</div>
          <div className="mt-3 space-y-2">
            {jobs.map((j) => (
              <div key={j.id} className="flex items-center gap-2 text-xs">
                <div className="w-8 h-8 rounded nx-checker overflow-hidden shrink-0">{j.output_preview || j.input_preview ? <img src={j.output_preview || j.input_preview} alt="" className="w-full h-full object-cover"/> : null}</div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-white/70">{j.title || j.input_name || 'Trabajo'}</div>
                  <div className="text-white/35">{new Date(j.created).toLocaleDateString('es-MX')} · <span style={{ color: j.status === 'error' ? '#FF2D95' : '#3ddc84' }}>{j.status}</span></div>
                </div>
                {j.result_file && (
                  <button
                    onClick={async () => { const url = await getJobResultUrl(j); if (url) window.open(url, '_blank'); }}
                    title="Descargar resultado"
                    className="shrink-0 p-1.5 rounded text-white/40 hover:text-[#00F0FF] hover:bg-white/5"
                  >
                    <Download size={13}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ToolShell eyebrow="NEONEXA TOOLS" title={tool?.name} subtitle={tool?.desc} sidebar={sidebar}>
      {!file ? (
        <Dropzone onFile={onFile} accept={accept} hint={hint} />
      ) : (
        <div className="space-y-4">
          {busy && (
            <div className="w-full h-2 bg-white/10 rounded overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#00AEEF] to-[#00F0FF] transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {err && <div className="flex items-center gap-2 text-[#FF2D95] text-sm bg-[#FF2D95]/10 px-4 py-3 rounded"><AlertTriangle size={16}/>{err}</div>}
          <div className="grid md:grid-cols-2 gap-4">
            <figure>
              <figcaption className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Antes</figcaption>
              <div className="nx-checker rounded-lg overflow-hidden flex items-center justify-center min-h-[280px]">
                <img src={srcUrl} alt="original" className="max-w-full max-h-[420px] object-contain"/>
              </div>
            </figure>
            <figure>
              <figcaption className="text-[11px] uppercase tracking-widest text-white/50 mb-2">Después</figcaption>
              <div className="nx-checker rounded-lg overflow-hidden flex items-center justify-center min-h-[280px]">
                {busy ? <Loader2 className="animate-spin text-[#00AEEF]" size={40}/>
                  : out?.outUrl ? <img src={out.outUrl} alt="resultado" className="max-w-full max-h-[420px] object-contain"/>
                  : <span className="text-white/30 text-sm">Pulsa “Procesar”</span>}
              </div>
            </figure>
          </div>
          {out?.summary && out.summary.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2">
              {out.summary.map((s, i) => (
                <div key={i} className="nx-card px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-white/60">{s.label}</span>
                  <span className="font-display" style={{ color: s.warn ? '#FFD400' : '#00F0FF' }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}
