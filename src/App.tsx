import { useEffect, useMemo, useRef, useState } from 'react'
import { clearLocal, getLocal, setLocal, type Preferences, type Progress } from './lib/storage'
import { validatePdf, type PdfPage } from './features/pdf'
import { createSpeechChunks, DevelopmentSpeechEngine, SpeechQueue } from './features/speech'

const defaultPreferences: Preferences = { voice: 'M1', speed: 1 }
const fingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`

export function App() {
  const [document, setDocument] = useState<{ name: string; fingerprint: string; pages: PdfPage[] }>()
  const [index, setIndex] = useState(0)
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [status, setStatus] = useState('Choose a PDF to begin.')
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const worker = useRef<Worker | undefined>(undefined)
  const engine = useRef(new DevelopmentSpeechEngine())
  const queue = useRef(new SpeechQueue(engine.current))
  const audio = useRef<{ source: AudioBufferSourceNode; context: AudioContext } | undefined>(undefined)
  const chunks = useMemo(() => createSpeechChunks(document?.pages ?? []), [document])

  useEffect(() => { getLocal<Preferences>('preferences').then((saved) => saved && setPreferences(saved)).catch(() => setStatus('Local settings are unavailable in this browser.')) }, [])
  useEffect(() => { setLocal('preferences', preferences).catch(() => undefined) }, [preferences])
  useEffect(() => { if (document) setLocal<Progress>(`progress:${document.fingerprint}`, { fingerprint: document.fingerprint, chunkIndex: index, updatedAt: Date.now() }).catch(() => undefined) }, [document, index])
  useEffect(() => () => { worker.current?.terminate(); queue.current.cancel(); void engine.current.dispose() }, [])

  async function choose(file?: File) {
    if (!file) return
    const validation = validatePdf(file)
    if (validation) { setError(validation); return }
    stop(); worker.current?.terminate(); queue.current.cancel(); setDocument(undefined); setError(''); setStatus('Extracting text locally…')
    const currentFingerprint = fingerprint(file)
    const next = new Worker(new URL('./workers/pdf.worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    next.onmessage = async ({ data }) => {
      if (data.error) { setError(data.error); setStatus('Extraction failed.'); return }
      if (!data.pages.some((page: PdfPage) => page.text)) { setError('No extractable text was found. Scanned PDFs are not supported yet.'); setStatus('No text found.'); return }
      if (import.meta.env.DEV) performance.measure('readlocal-pdf-total', { start: performance.now() - data.metrics.extractionMs - data.metrics.cleanupMs })
      setDocument({ name: file.name, fingerprint: currentFingerprint, pages: data.pages })
      const saved = await getLocal<Progress>(`progress:${currentFingerprint}`).catch(() => undefined)
      setIndex(Math.min(saved?.chunkIndex ?? 0, createSpeechChunks(data.pages).length - 1)); setStatus('Text extracted locally. Ready to play.')
    }
    next.onerror = () => { setError('PDF processing stopped unexpectedly. Try the file again.'); setStatus('Extraction failed.') }
    next.postMessage(await file.arrayBuffer())
  }

  function stop() { audio.current?.source.stop(); audio.current = undefined; setPlaying(false) }
  async function play() {
    const chunk = chunks[index]; if (!chunk) return
    setError(''); setStatus(import.meta.env.DEV ? 'Generating development mock audio locally…' : 'Supertonic model assets are not installed. See the setup guide.')
    try {
      const started = performance.now(); const buffer = await queue.current.generate(chunk, preferences)
      if (import.meta.env.DEV) performance.measure('readlocal-chunk-generation', { start: started })
      const context = new AudioContext(); const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = preferences.speed; source.connect(context.destination)
      source.onended = () => { void context.close(); setPlaying(false); if (index < chunks.length - 1) setIndex((value) => value + 1) }
      audio.current = { source, context }; source.start(); setPlaying(true); setStatus('Playing locally generated audio.')
    } catch (cause) { setPlaying(false); setError(cause instanceof Error ? cause.message : 'Speech generation failed.'); setStatus('Speech unavailable.') }
  }
  async function clearData() { stop(); await clearLocal().catch(() => undefined); setDocument(undefined); setIndex(0); setPreferences(defaultPreferences); setStatus('Local data cleared.') }

  return <main>
    <header><span className="eyebrow">Private listening, anywhere</span><h1>ReadLocal</h1><p>Turn PDFs into speech without sending your reading anywhere.</p></header>
    <aside className="privacy" aria-label="Privacy guarantee"><strong>Your document stays on your device.</strong> PDF extraction and speech generation happen locally in your browser.</aside>
    <p className="status" role="status" aria-live="polite">{status}</p>{error && <p className="error" role="alert">{error}</p>}
    {!document ? <section className="picker" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files[0]) }}>
      <h2>Choose your PDF</h2><p>Text-based PDFs up to 100 MB. Scanned documents and OCR are not supported yet.</p>
      <label className="button">Select PDF<input aria-label="Select PDF" type="file" accept="application/pdf,.pdf" onChange={(event) => void choose(event.target.files?.[0])}/></label>
    </section> : <section className="reader">
      <div className="reader-head"><div><span className="eyebrow">Now reading</span><h2>{document.name}</h2></div><button className="quiet" onClick={() => { stop(); queue.current.cancel(); setDocument(undefined) }}>Clear document</button></div>
      <div className="progress"><span>Page {chunks[index]?.pageNumber ?? 1}</span><span>{chunks.length ? Math.round(((index + 1) / chunks.length) * 100) : 0}%</span></div><progress aria-label="Reading progress" value={index + 1} max={chunks.length}/>
      <article aria-label="Extracted document text">{chunks.map((chunk, chunkIndex) => <p key={chunk.id} className={chunkIndex === index ? 'active' : ''}>{chunk.text}</p>)}</article>
      <div className="controls" aria-label="Playback controls">
        <button aria-label="Previous section" disabled={!index} onClick={() => { stop(); setIndex((value) => Math.max(0, value - 1)) }}>←</button>
        <button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => playing ? stop() : void play()}>{playing ? 'Pause' : 'Play'}</button>
        <button aria-label="Next section" disabled={index >= chunks.length - 1} onClick={() => { stop(); setIndex((value) => Math.min(chunks.length - 1, value + 1)) }}>→</button>
        <label>Voice<select value={preferences.voice} onChange={(event) => setPreferences({ ...preferences, voice: event.target.value })}>{['M1','M2','F1','F2'].map((voice) => <option key={voice}>{voice}</option>)}</select></label>
        <label>Speed<select aria-label="Playback speed" value={preferences.speed} onChange={(event) => setPreferences({ ...preferences, speed: Number(event.target.value) })}>{[0.75,1,1.25,1.5,2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
        <button className="quiet" onClick={stop}>Stop</button>
      </div>
    </section>}
    <footer><button className="quiet" onClick={() => void clearData()}>Clear local data</button><span>No accounts · No analytics · No uploads</span></footer>
  </main>
}
