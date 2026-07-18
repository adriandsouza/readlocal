import { useEffect, useMemo, useRef, useState } from 'react'
import { ReaderBody } from './components/ReaderBody'
import { PlaybackControls, type Playback } from './components/PlaybackControls'
import { Library } from './components/Library'
import {
  validatePdfFile,
  type PdfPage,
  type ProcessingState,
} from './features/pdf'
import { ingestPdf } from './features/ingest'
import {
  createSpeechChunks,
  SpeechQueue,
  SupertonicSpeechEngine,
} from './features/speech'
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
  }>()
  const [index, setIndex] = useState(0)
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [status, setStatus] = useState('Choose a PDF to begin.')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState<ProcessingState | undefined>()
  const [playback, setPlayback] = useState<Playback>('idle')
  const [voiceState, setVoiceState] = useState<
    'unprepared' | 'preparing' | 'ready'
  >('unprepared')
  const [elapsed, setElapsed] = useState(0)
  const [systemDark, setSystemDark] = useState(false)
  const [progressReady, setProgressReady] = useState(true)
  const ingestion = useRef<AbortController | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const documentUrl = useRef<string | undefined>(undefined)
  const [engine] = useState(() => new SupertonicSpeechEngine())
  const [queue] = useState(() => new SpeechQueue(engine))
  const audio = useRef<
    { source: AudioBufferSourceNode; context: AudioContext } | undefined
  >(undefined)
  const playbackContext = useRef<AudioContext | undefined>(undefined)
  const chunks = useMemo(
    () => createSpeechChunks(document?.pages ?? []),
    [document],
  )
  const chunksRef = useRef(chunks)
  const current = chunks[index]
  const documentFingerprint = document?.fingerprint
  const isDark =
    preferences.theme === 'dark' ||
    (preferences.theme === 'system' && systemDark)
  const busy =
    processing === 'extracting' ||
    processing === 'ocr' ||
    voiceState === 'preparing'

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
      .finally(() => setPreferencesReady(true))
  }, [])
  useEffect(() => {
    if (!preferencesReady) return
    void setLocal('preferences', preferences).catch(() => undefined)
  }, [preferences, preferencesReady])
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
    if (playback !== 'playing') return
    globalThis.document
      .querySelector('.active-sentence')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [index, playback])
  useEffect(() => {
    chunksRef.current = chunks
  }, [chunks])

  function stopAudio() {
    const active = audio.current
    audio.current = undefined
    try {
      active?.source.stop()
    } catch {
      /* already stopped */
    }
    void playbackContext.current?.close()
    playbackContext.current = undefined
    setPlayback('idle')
  }

  useEffect(
    () => () => {
      ingestion.current?.abort()
      queue.cancel()
      stopAudio()
      if (documentUrl.current) URL.revokeObjectURL(documentUrl.current)
      void engine.dispose()
    },
    [engine, queue],
  )

  async function choose(file?: File) {
    if (!file) return
    ingestion.current?.abort()
    const controller = new AbortController()
    ingestion.current = controller
    const validation = await validatePdfFile(file)
    if (controller.signal.aborted) return
    if (validation) {
      ingestion.current = undefined
      setError(validation)
      setProcessing('failed')
      return
    }
    stopAudio()
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
    if (controller.signal.aborted) return
    try {
      const { result, ocrPages, skippedPages } = await ingestPdf(
        file,
        controller.signal,
        (state, message) => {
          setProcessing(state)
          setStatus(message)
        },
      )
      if (!result.fullText)
        throw new Error(
          'No readable text was found. This PDF may be blank or its images may be too unclear to read.',
        )
      const speechPages = result.pages
      const originalUrl = documentUrl.current ?? URL.createObjectURL(file)
      documentUrl.current = originalUrl
      setDocument({
        name: file.name,
        fingerprint: currentFingerprint,
        pages: speechPages,
        originalUrl,
      })
      const availableChunks = createSpeechChunks(speechPages)
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
              )
      if (restored !== undefined) {
        setIndex(restored)
        setProgressReady(true)
      }
      setProcessing('completed')
      if (voiceState === 'ready')
        setStatus('PDF ready. Select a sentence or press Play.')
      else {
        setStatus(
          ocrPages || skippedPages
            ? `${ocrPages} page${ocrPages === 1 ? '' : 's'} recovered with local OCR${skippedPages ? `; ${skippedPages} unreadable page${skippedPages === 1 ? '' : 's'} skipped` : ''}. Preparing voice…`
            : 'PDF ready. Preparing voice automatically…',
        )
        void prepareVoice()
      }
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(
        cause instanceof Error ? cause.message : 'PDF processing failed.',
      )
      setProgressReady(true)
      setProcessing('failed')
      setStatus('Extraction failed.')
    } finally {
      if (ingestion.current === controller) ingestion.current = undefined
    }
  }

  async function start(chunkIndex = index, options = preferences) {
    if (voiceState !== 'ready') {
      setStatus('Prepare voice before selecting a sentence.')
      return
    }
    const available = chunksRef.current
    const chunk = available[chunkIndex]
    if (!chunk) return
    const context = playbackContext.current ?? new AudioContext()
    playbackContext.current = context
    const unlocked = context.resume()
    setError('')
    setPlayback('generating')
    setStatus('Generating English speech with Supertonic locally…')
    try {
      const buffer = await queue.generate(chunk, options)
      await unlocked
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.onended = () => {
        if (audio.current?.source !== source) return
        audio.current = undefined
        const next = chunkIndex + 1
        if (next < chunksRef.current.length) void start(next, options)
        else {
          void context.close()
          playbackContext.current = undefined
          setPlayback('idle')
          setStatus('Finished reading.')
        }
      }
      audio.current = { source, context }
      setIndex(chunkIndex)
      source.start()
      setPlayback('playing')
      setStatus('Playing Supertonic audio locally.')
      const upcoming = chunksRef.current[chunkIndex + 1]
      if (upcoming)
        void queue.generate(upcoming, options).catch(() => undefined)
      queue.releaseExcept(
        [chunksRef.current[chunkIndex - 1]?.id, chunk.id, upcoming?.id].filter(
          Boolean,
        ) as string[],
      )
    } catch (cause) {
      void context.close()
      playbackContext.current = undefined
      setPlayback('idle')
      setError(
        cause instanceof Error ? cause.message : 'Speech generation failed.',
      )
      setStatus('Speech unavailable.')
    }
  }

  async function prepareVoice() {
    if (voiceState !== 'unprepared') return
    setError('')
    setVoiceState('preparing')
    setStatus('Downloading and loading voice models on your device…')
    try {
      await engine.initialize((name, current, total) =>
        setStatus(`Loading voice engine (${current} of ${total}): ${name}…`),
      )
      setVoiceState('ready')
      setStatus('Voice ready. Select a sentence or press Play.')
    } catch (cause) {
      setVoiceState('unprepared')
      setError(
        cause instanceof Error ? cause.message : 'Voice preparation failed.',
      )
      setStatus('Voice preparation failed. Press Retry voice to try again.')
    }
  }

  async function togglePlayback() {
    if (voiceState !== 'ready') {
      await prepareVoice()
      return
    }
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
      setStatus(
        `The saved sentence on page ${bookmark.pageNumber} was not found.`,
      )
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
      {busy && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div
            className="flex w-full max-w-sm items-center gap-4 rounded-2xl border border-amber-200 bg-[#fffdf7]/95 p-4 shadow-2xl shadow-black/30 dark:border-slate-700 dark:bg-slate-900/95"
            role="status"
            aria-label="Loading document and voice"
            aria-live="polite"
          >
            <span
              className="size-9 shrink-0 animate-spin rounded-full border-4 border-amber-200 border-t-orange-600 motion-reduce:animate-pulse dark:border-slate-700 dark:border-t-amber-400"
              aria-hidden="true"
            />
            <span>
              <strong className="block font-serif text-lg">
                Initiating your audio
              </strong>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {status}
              </span>
            </span>
          </div>
        </div>
      )}
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
            history={history}
            fileInput={fileInput}
            onChoose={(file) => void choose(file)}
            onRecent={(name) => {
              setStatus(`Select “${name}” to resume.`)
              fileInput.current?.click()
            }}
          />
        ) : (
          <section className="rounded-3xl border border-stone-300 bg-[#eee9df] p-3 shadow-xl shadow-emerald-950/10 dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20 sm:p-8">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 max-w-full">
                <span className="text-xs font-extrabold tracking-[.13em] text-slate-500 uppercase dark:text-slate-400">
                  Now reading
                </span>
                <h2 className="max-w-full [overflow-wrap:anywhere] font-serif text-3xl font-bold sm:text-4xl">
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
              chunks={chunks}
              index={index}
              elapsed={elapsed}
              speed={preferences.speed}
              bookmarks={bookmarks}
              voiceReady={voiceState === 'ready'}
              onAddBookmark={addBookmark}
              onOpenBookmark={openBookmark}
              onRemoveBookmark={(bookmark) =>
                saveBookmarks(
                  bookmarks.filter((item) => item.chunkId !== bookmark.chunkId),
                )
              }
              onStartPage={startPage}
              onStartSentence={(sentence) => {
                stopAudio()
                queue.releaseExcept([])
                setIndex(sentence)
                void start(sentence)
              }}
            />
            <PlaybackControls
              playback={playback}
              voiceState={voiceState}
              index={index}
              chunkCount={chunks.length}
              preferences={preferences}
              onPlay={() => void togglePlayback()}
              onMove={moveParagraph}
              onVoice={changeVoice}
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
