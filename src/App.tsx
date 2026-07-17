import { useEffect, useMemo, useRef, useState } from 'react'
import { ReaderBody } from './components/ReaderBody'
import { PlaybackControls, type Playback } from './components/PlaybackControls'
import { Library } from './components/Library'
import {
  normalizeIngestion,
  PDF_TIMEOUT_MS,
  evaluateTextQuality,
  shouldPublishBatch,
  toSpeechPages,
  validatePdfFile,
  type PdfIngestionResult,
  type PdfPage,
  type ProcessingState,
  type RawPdfPage,
} from './features/pdf'
import {
  createSpeechChunks,
  SpeechQueue,
  SupertonicSpeechEngine,
} from './features/speech'
import { recognizePage } from './features/ocr'
import {
  availableProgressIndex,
  clearLocal,
  getLocal,
  setLocal,
  type Bookmark,
  type HistoryEntry,
  type Preferences,
  type Progress,
  type Theme,
} from './lib/storage'

const defaultPreferences: Preferences = {
  voice: 'M1',
  speed: 1,
  language: 'auto',
  theme: 'system',
}
const fingerprint = (file: File) =>
  `${file.name}:${file.size}:${file.lastModified}`
const buttonClass =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-emerald-950 px-5 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-45'
const quietButtonClass = `${buttonClass} border border-slate-400 bg-transparent text-emerald-950 dark:border-slate-600 dark:text-slate-100`
const selectClass =
  'min-h-10 rounded-md border border-slate-400 bg-white px-2 text-emerald-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function App() {
  const [document, setDocument] = useState<{
    name: string
    fingerprint: string
    pages: PdfPage[]
    originalUrl: string
    ingestion: PdfIngestionResult
  }>()
  const [index, setIndex] = useState(0)
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [status, setStatus] = useState('Choose a PDF to begin.')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<ProcessingState | undefined>()
  const [playback, setPlayback] = useState<Playback>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [systemDark, setSystemDark] = useState(false)
  const [progressReady, setProgressReady] = useState(true)
  const worker = useRef<Worker | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const processingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const documentUrl = useRef<string | undefined>(undefined)
  const [engine] = useState(() => new SupertonicSpeechEngine())
  const [queue] = useState(() => new SpeechQueue(engine))
  const audio = useRef<
    { source: AudioBufferSourceNode; context: AudioContext } | undefined
  >(undefined)
  const chunks = useMemo(
    () => createSpeechChunks(document?.pages ?? [], preferences.language),
    [document, preferences.language],
  )
  const chunksRef = useRef(chunks)
  const processingRef = useRef(processing)
  const current = chunks[index]
  const documentFingerprint = document?.fingerprint
  const isDark =
    preferences.theme === 'dark' ||
    (preferences.theme === 'system' && systemDark)

  useEffect(() => {
    Promise.all([
      getLocal<Preferences>('preferences'),
      getLocal<HistoryEntry[]>('history'),
    ])
      .then(([saved, recent]) => {
        if (saved) setPreferences({ ...defaultPreferences, ...saved })
        if (recent) setHistory(recent)
      })
      .catch(() => setStatus('Local settings are unavailable in this browser.'))
  }, [])
  useEffect(() => {
    void setLocal('preferences', preferences).catch(() => undefined)
  }, [preferences])
  useEffect(() => {
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = () => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!document || !chunks.length || !progressReady) return
    const progress: Progress = {
      fingerprint: document.fingerprint,
      chunkIndex: index,
      chunkId: current?.id,
      pageNumber: current?.pageNumber,
      updatedAt: Date.now(),
    }
    void setLocal(`progress:${document.fingerprint}`, progress).catch(
      () => undefined,
    )
    const next = [
      {
        fingerprint: document.fingerprint,
        name: document.name,
        chunkIndex: index,
        totalChunks: chunks.length,
        updatedAt: progress.updatedAt,
      },
      ...history.filter((item) => item.fingerprint !== document.fingerprint),
    ].slice(0, 10)
    void setLocal('history', next).catch(() => undefined)
    // history is intentionally excluded: including it would loop after setHistory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, index, chunks.length, progressReady])
  useEffect(() => {
    if (!documentFingerprint) return
    let active = true
    void getLocal<Bookmark[]>(`bookmarks:${documentFingerprint}`)
      .then((saved) => {
        if (active) setBookmarks(saved ?? [])
      })
      .catch(() => {
        if (active) setBookmarks([])
      })
    return () => {
      active = false
    }
  }, [documentFingerprint])
  useEffect(() => {
    if (playback !== 'playing') return
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [playback])
  useEffect(() => {
    globalThis.document
      .querySelector('.active-sentence')
      ?.scrollIntoView({ block: 'center' })
  }, [index])
  useEffect(() => {
    chunksRef.current = chunks
  }, [chunks])
  useEffect(() => {
    processingRef.current = processing
  }, [processing])

  function stopAudio() {
    const active = audio.current
    audio.current = undefined
    try {
      active?.source.stop()
    } catch {
      /* already stopped */
    }
    void active?.context.close()
    setPlayback('idle')
  }

  useEffect(
    () => () => {
      worker.current?.terminate()
      clearTimeout(processingTimer.current)
      queue.cancel()
      stopAudio()
      if (documentUrl.current) URL.revokeObjectURL(documentUrl.current)
      void engine.dispose()
    },
    [engine, queue],
  )

  async function choose(file?: File) {
    if (!file) return
    const validation = await validatePdfFile(file)
    if (validation) {
      setError(validation)
      setProcessing('failed')
      return
    }
    stopAudio()
    worker.current?.terminate()
    clearTimeout(processingTimer.current)
    queue.cancel()
    if (document) URL.revokeObjectURL(document.originalUrl)
    setDocument(undefined)
    setBookmarks([])
    setProgressReady(false)
    setError('')
    setElapsed(0)
    setProcessing('extracting')
    setStatus('Inspecting PDF pages locally…')
    const currentFingerprint = fingerprint(file)
    const resumeProgress = await getLocal<Progress>(
      `progress:${currentFingerprint}`,
    ).catch(() => undefined)
    const nextWorker = new Worker(
      new URL('./workers/pdf.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.current = nextWorker
    let pageCount = 0
    let settled = false
    let resumeApplied = false
    const pages: Array<{
      pageNumber: number
      lines: string[]
      extractionMethod: 'embedded-text' | 'ocr'
      confidence?: number
      language?: PdfPage['language']
    }> = []
    const warnings: string[] = []
    const fail = async (message: string) => {
      if (settled) return
      settled = true
      clearTimeout(processingTimer.current)
      nextWorker.terminate()
      setError(message)
      setProgressReady(true)
      setProcessing('failed')
      setStatus('Extraction failed.')
    }
    const resetTimer = () => {
      clearTimeout(processingTimer.current)
      processingTimer.current = setTimeout(() => {
        void fail(
          `PDF processing made no progress for ${Math.round(PDF_TIMEOUT_MS / 1000)} seconds.`,
        )
      }, PDF_TIMEOUT_MS)
    }
    const publish = async (final: boolean) => {
      const ingestion = normalizeIngestion(
        file.name,
        pageCount,
        pages,
        warnings,
      )
      if (!ingestion.fullText) return false
      const speechPages = toSpeechPages(ingestion)
      const originalUrl = documentUrl.current ?? URL.createObjectURL(file)
      documentUrl.current = originalUrl
      setDocument({
        name: file.name,
        fingerprint: currentFingerprint,
        pages: speechPages,
        originalUrl,
        ingestion,
      })
      const availableChunks = createSpeechChunks(
        speechPages,
        preferences.language,
      )
      const sentenceIndex = resumeProgress?.chunkId
        ? availableChunks.findIndex(
            (chunk) => chunk.id === resumeProgress.chunkId,
          )
        : -1
      const pageIndex = resumeProgress?.pageNumber
        ? availableChunks.findIndex(
            (chunk) => chunk.pageNumber === resumeProgress.pageNumber,
          )
        : -1
      const restored =
        sentenceIndex >= 0
          ? sentenceIndex
          : pageIndex >= 0
            ? pageIndex
            : availableProgressIndex(
                resumeProgress?.chunkIndex ?? 0,
                availableChunks.length,
                final,
              )
      if (!resumeApplied && restored !== undefined) {
        setIndex(restored)
        setProgressReady(true)
        resumeApplied = true
      }
      setProcessing(final ? 'completed' : 'extracting')
      return true
    }
    resetTimer()
    nextWorker.onmessage = async ({ data }) => {
      if (settled) return
      resetTimer()
      if (data.type === 'opened') {
        pageCount = data.pageCount
        setStatus(`Extracting ${pageCount} pages locally…`)
        return
      }
      if (data.type === 'error') {
        await fail(data.error)
        return
      }
      if (data.type === 'page') {
        const page = data.page as RawPdfPage
        try {
          if (page.quality.usable)
            pages.push({
              pageNumber: page.pageNumber,
              lines: page.text.split('\n'),
              extractionMethod: 'embedded-text',
            })
          else {
            setProcessing('ocr')
            setStatus(`Running OCR on page ${page.pageNumber} of ${pageCount}…`)
            const result = await recognizePage(
              page.ocrImage!,
              preferences.language,
              (progress) =>
                setStatus(
                  `OCR page ${page.pageNumber}: ${Math.round(progress * 100)}% — processed locally`,
                ),
            )
            const ocrText = result.text.trim()
            if (!evaluateTextQuality(ocrText).usable) {
              throw new Error(
                `OCR on page ${page.pageNumber} did not recover readable text.`,
              )
            }
            pages.push({
              pageNumber: page.pageNumber,
              lines: ocrText.split('\n'),
              extractionMethod: 'ocr',
              confidence: result.confidence,
              language: result.language,
            })
            warnings.push(
              `Page ${page.pageNumber} used OCR: ${page.quality.reason}.`,
            )
            delete page.ocrImage
          }
        } catch (cause) {
          await fail(
            cause instanceof Error
              ? `Page ${page.pageNumber}: ${cause.message}`
              : `OCR failed on page ${page.pageNumber}.`,
          )
          return
        }
        const resumeReady = page.pageNumber === resumeProgress?.pageNumber
        const batchReady =
          resumeReady || shouldPublishBatch(pages.length, pageCount)
        if (batchReady) {
          await publish(false)
          setStatus(
            resumeReady
              ? `Resumed at page ${page.pageNumber}. Processing the remaining pages in the background…`
              : `First ${pages.length} pages are ready. Processing the remaining ${pageCount - pages.length} pages in the background…`,
          )
        }
        nextWorker.postMessage({ type: 'ack' })
        setProcessing('extracting')
        if (!batchReady)
          setStatus(
            `Processed page ${page.pageNumber} of ${pageCount} locally…`,
          )
        return
      }
      if (data.type === 'complete') {
        settled = true
        clearTimeout(processingTimer.current)
        nextWorker.terminate()
        if (!(await publish(true))) {
          setError('No readable text was found, including with local OCR.')
          setProcessing('failed')
          setStatus('Extraction failed.')
          return
        }
        setStatus(
          warnings.length
            ? `${warnings.length} page${warnings.length === 1 ? '' : 's'} recovered with local OCR. Ready to play.`
            : 'Embedded text extracted locally. Ready to play.',
        )
      }
    }
    nextWorker.onerror = () => {
      void fail('PDF processing stopped unexpectedly. Try the file again.')
    }
    nextWorker.postMessage({
      type: 'start',
      file,
      priorityPage: resumeProgress?.pageNumber,
    })
  }

  async function start(chunkIndex = index, options = preferences) {
    const available = chunksRef.current
    const chunk = available[chunkIndex]
    if (!chunk) return
    setIndex(chunkIndex)
    setError('')
    setPlayback('generating')
    setStatus(
      `Generating ${chunk.language.toUpperCase()} speech with Supertonic locally…`,
    )
    try {
      const buffer = await queue.generate(chunk, options)
      const context = new AudioContext()
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        if (audio.current?.source !== source) return
        audio.current = undefined
        void context.close()
        const next = chunkIndex + 1
        if (next < chunksRef.current.length) void start(next, options)
        else {
          setPlayback('idle')
          setStatus(
            processingRef.current === 'completed'
              ? 'Finished reading.'
              : 'Waiting for more pages to finish processing…',
          )
        }
      }
      audio.current = { source, context }
      source.start()
      setPlayback('playing')
      setStatus('Playing Supertonic audio locally.')
      const upcoming = chunksRef.current[chunkIndex + 1]
      if (upcoming)
        void queue.generate(upcoming, options).catch(() => undefined)
      queue.releaseExcept([chunk.id, upcoming?.id].filter(Boolean) as string[])
    } catch (cause) {
      setPlayback('idle')
      setError(
        cause instanceof Error ? cause.message : 'Speech generation failed.',
      )
      setStatus('Speech unavailable.')
    }
  }

  async function togglePlayback() {
    if (playback === 'playing') {
      await audio.current?.context.suspend()
      setPlayback('paused')
      setStatus('Paused.')
    } else if (playback === 'paused') {
      await audio.current?.context.resume()
      setPlayback('playing')
      setStatus('Playing Supertonic audio locally.')
    } else await start()
  }

  function changeVoice(voice: string) {
    const next = { ...preferences, voice }
    const resume = playback !== 'idle'
    stopAudio()
    queue.cancel()
    setPreferences(next)
    if (resume) void start(index, next)
  }

  function startPage(pageNumber: number) {
    const target = chunksRef.current.findIndex(
      (chunk) => chunk.pageNumber === pageNumber,
    )
    if (target < 0) return
    stopAudio()
    queue.releaseExcept([])
    setIndex(target)
    void start(target)
  }

  function saveBookmarks(next: Bookmark[]) {
    if (!document) return
    setBookmarks(next)
    void setLocal(`bookmarks:${document.fingerprint}`, next).catch(() =>
      setStatus('This browser could not save the bookmark.'),
    )
  }

  function addBookmark() {
    if (!current || bookmarks.some((item) => item.chunkId === current.id))
      return
    saveBookmarks([
      ...bookmarks,
      {
        chunkId: current.id,
        pageNumber: current.pageNumber,
        text: current.text,
        createdAt: Date.now(),
      },
    ])
    setStatus(`Bookmarked page ${current.pageNumber}.`)
  }

  function openBookmark(bookmark: Bookmark) {
    const target = chunksRef.current.findIndex(
      (chunk) => chunk.id === bookmark.chunkId,
    )
    if (target < 0) {
      setStatus(`Page ${bookmark.pageNumber} is still processing.`)
      return
    }
    globalThis.document
      .getElementById(`speech-chunk-${bookmark.chunkId}`)
      ?.scrollIntoView({ block: 'center' })
    stopAudio()
    queue.releaseExcept([])
    setIndex(target)
    void start(target)
  }

  function moveParagraph(direction: -1 | 1) {
    stopAudio()
    queue.releaseExcept([])
    const key = `${current?.pageNumber}-${current?.paragraph}`
    let target = -1
    if (direction < 0)
      for (let position = index - 1; position >= 0; position--) {
        if (
          `${chunks[position].pageNumber}-${chunks[position].paragraph}` !== key
        ) {
          target = position
          break
        }
      }
    else
      target = chunks.findIndex(
        (chunk, position) =>
          position > index && `${chunk.pageNumber}-${chunk.paragraph}` !== key,
      )
    if (target >= 0) setIndex(target)
  }
  async function clearData() {
    stopAudio()
    queue.cancel()
    if (documentUrl.current) URL.revokeObjectURL(documentUrl.current)
    documentUrl.current = undefined
    await clearLocal().catch(() => undefined)
    setDocument(undefined)
    setHistory([])
    setBookmarks([])
    setIndex(0)
    setElapsed(0)
    setPreferences(defaultPreferences)
    setStatus('Local data cleared.')
  }

  return (
    <main
      data-processing-state={processing}
      className={`${isDark ? 'dark' : ''} min-h-screen bg-stone-100 text-emerald-950 transition-colors dark:bg-slate-950 dark:text-slate-100`}
    >
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-8 lg:p-12">
        <header className="flex flex-col items-start justify-between gap-6 py-8 sm:flex-row sm:py-16">
          <div>
            <span className="text-xs font-extrabold tracking-[.13em] text-slate-500 uppercase dark:text-slate-400">
              Private listening, anywhere
            </span>
            <h1 className="my-4 font-serif text-6xl leading-[.85] font-bold tracking-[-.07em] sm:text-8xl">
              ReadLocal
            </h1>
            <p className="max-w-xl text-slate-600 dark:text-slate-300">
              Turn PDFs into natural speech without surrendering your privacy.
            </p>
          </div>
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Theme
            <select
              className={`${selectClass} mt-1 block`}
              aria-label="Theme"
              value={preferences.theme}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  theme: event.target.value as Theme,
                })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </header>
        <aside
          className="rounded-xl border border-emerald-200 border-l-4 border-l-emerald-700 bg-emerald-100 p-4 shadow-sm dark:border-emerald-900 dark:border-l-emerald-400 dark:bg-emerald-950/60"
          aria-label="Privacy guarantee"
        >
          <strong className="block">
            Your documents never leave your device.
          </strong>
          <span className="block">
            PDF extraction and speech generation happen locally in your browser.
          </span>
        </aside>
        <p
          className="min-h-6 py-3 text-slate-600 dark:text-slate-300"
          role="status"
          aria-live="polite"
        >
          {status}
        </p>
        {error && (
          <p
            className="rounded-lg bg-red-100 p-4 text-red-900 dark:bg-red-950 dark:text-red-100"
            role="alert"
          >
            {error}
          </p>
        )}
        {!document ? (
          <Library
            language={preferences.language}
            history={history}
            fileInput={fileInput}
            onLanguage={(language) =>
              setPreferences({ ...preferences, language })
            }
            onChoose={(file) => void choose(file)}
            onRecent={(name) => {
              setStatus(`Select “${name}” to resume.`)
              fileInput.current?.click()
            }}
          />
        ) : (
          <section className="rounded-3xl border border-stone-200 bg-white p-4 shadow-xl shadow-emerald-950/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <span className="text-xs font-extrabold tracking-[.13em] text-slate-500 uppercase dark:text-slate-400">
                  Now reading
                </span>
                <h2 className="font-serif text-3xl font-bold sm:text-4xl">
                  {document.name}
                </h2>
                <a
                  className="underline"
                  href={document.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View original PDF
                </a>
              </div>
              <button
                className={quietButtonClass}
                onClick={() => {
                  stopAudio()
                  queue.cancel()
                  URL.revokeObjectURL(document.originalUrl)
                  documentUrl.current = undefined
                  setDocument(undefined)
                }}
              >
                Clear document
              </button>
            </div>
            <ReaderBody
              ingestion={document.ingestion}
              processing={processing}
              chunks={chunks}
              index={index}
              elapsed={elapsed}
              speed={preferences.speed}
              bookmarks={bookmarks}
              onAddBookmark={addBookmark}
              onOpenBookmark={openBookmark}
              onRemoveBookmark={(bookmark) =>
                saveBookmarks(
                  bookmarks.filter((item) => item.chunkId !== bookmark.chunkId),
                )
              }
              onStartPage={startPage}
            />
            <PlaybackControls
              playback={playback}
              index={index}
              chunkCount={chunks.length}
              preferences={preferences}
              onPlay={() => void togglePlayback()}
              onMove={moveParagraph}
              onVoice={changeVoice}
              onLanguage={(language) => {
                stopAudio()
                setIndex(0)
                setPreferences({ ...preferences, language })
              }}
              onSpeed={(speed) => setPreferences({ ...preferences, speed })}
              onStop={() => {
                stopAudio()
                setStatus('Stopped.')
              }}
            />
          </section>
        )}
        <footer className="flex flex-col items-start justify-between gap-4 py-8 text-sm text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center">
          <button className={quietButtonClass} onClick={() => void clearData()}>
            Clear local data
          </button>
          <span>No accounts · No analytics · No uploads</span>
        </footer>
      </div>
    </main>
  )
}
