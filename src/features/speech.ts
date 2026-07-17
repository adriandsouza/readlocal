import type { PdfPage } from './pdf'
import { isSpeechLanguage, textDirection, type Language } from './language'

export type SpeechStatus =
  'pending' | 'generating' | 'ready' | 'playing' | 'played' | 'error'
export type SpeechChunk = {
  id: string
  pageNumber: number
  paragraph: number
  text: string
  language: Language
  direction: 'ltr' | 'rtl'
  status: SpeechStatus
}
export type SpeechOptions = {
  voice: string
  speed: number
  language: Language
  signal?: AbortSignal
}
export interface SpeechEngine {
  initialize(onProgress?: (name: string, current: number, total: number) => void): Promise<void>
  synthesize(text: string, options: SpeechOptions): Promise<AudioBuffer>
  dispose(): Promise<void>
}
type SupertonicModel = {
  textToSpeech: {
    call(
      text: string,
      language: string,
      style: unknown,
      steps: number,
      speed: number,
    ): Promise<{ wav: number[] }>
  }
}

export function createSpeechChunks(
  pages: PdfPage[],
  override: Language | 'auto' = 'auto',
): SpeechChunk[] {
  return pages.flatMap((page) =>
    page.text.split(/\n{2,}/).flatMap((paragraph, paragraphIndex) => {
      const segmentLanguage = override === 'auto' ? page.language : override
      const segmenter = new Intl.Segmenter(
        segmentLanguage === 'zh' ? 'zh' : segmentLanguage,
        { granularity: 'sentence' },
      )
      const protectedText = paragraph.replace(
        /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi,
        '$1∯',
      )
      return [...segmenter.segment(protectedText)]
        .map(({ segment }) => segment.replaceAll('∯', '.').trim())
        .filter(Boolean)
        .map((text, sentenceIndex) => ({
          id: `${page.pageNumber}-${paragraphIndex}-${sentenceIndex}`,
          pageNumber: page.pageNumber,
          paragraph: paragraphIndex,
          text,
          language: override === 'auto' ? page.language : override,
          direction: textDirection(
            override === 'auto' ? page.language : override,
          ),
          status: 'pending' as const,
        }))
    }),
  )
}

export class SpeechQueue {
  private generation = new Map<string, Promise<AudioBuffer>>()
  private ready = new Map<string, AudioBuffer>()
  private controller = new AbortController()
  constructor(private engine: SpeechEngine) {}
  generate(
    chunk: SpeechChunk,
    options: Omit<SpeechOptions, 'signal' | 'language'>,
  ) {
    const ready = this.ready.get(chunk.id)
    if (ready) return Promise.resolve(ready)
    const existing = this.generation.get(chunk.id)
    if (existing) return existing
    const task = this.engine
      .synthesize(chunk.text, {
        ...options,
        language: chunk.language,
        signal: this.controller.signal,
      })
      .then((buffer) => {
        this.ready.set(chunk.id, buffer)
        while (this.ready.size > 3)
          this.ready.delete(this.ready.keys().next().value!)
        return buffer
      })
      .finally(() => this.generation.delete(chunk.id))
    this.generation.set(chunk.id, task)
    return task
  }
  cancel() {
    this.controller.abort()
    this.controller = new AbortController()
    this.generation.clear()
    this.ready.clear()
  }
  releaseExcept(ids: string[]) {
    for (const id of this.ready.keys())
      if (!ids.includes(id)) this.ready.delete(id)
  }
  get pending() {
    return this.generation.size
  }
}

const MODEL_BASE = '/supertonic'

export const isIOS = (
  browser: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> =
    globalThis.navigator,
) =>
  /iPad|iPhone|iPod/.test(browser.userAgent) ||
  (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1)

export const hasWebGPU = (browser: object = globalThis.navigator) =>
  'gpu' in browser

export class SupertonicSpeechEngine implements SpeechEngine {
  private context?: AudioContext
  private runtime = import('./supertonic')
  private model?: Promise<SupertonicModel>
  private styles = new Map<string, Promise<unknown>>()
  async initialize(
    onProgress?: (name: string, current: number, total: number) => void,
  ) {
    this.context ??= new AudioContext()
    const { configureIOSWasm, loadTextToSpeech } = await this.runtime
    const ios = isIOS()
    if (ios) configureIOSWasm()
    const load = (executionProvider: 'webgpu' | 'wasm') =>
      loadTextToSpeech(`${MODEL_BASE}/onnx`, {
        executionProviders: [executionProvider],
        graphOptimizationLevel: 'all',
      }, onProgress)
    this.model ??= (
      hasWebGPU() ? load('webgpu').catch(() => load('wasm')) : load('wasm')
    ).catch((cause) => {
      this.model = undefined
      throw new Error(
        `Speech engine could not start: ${cause instanceof Error ? cause.message : 'unknown browser error'}`,
      )
    })
    await this.model
  }
  async synthesize(text: string, options: SpeechOptions) {
    await this.initialize()
    options.signal?.throwIfAborted()
    const { loadVoiceStyle } = await this.runtime
    const style =
      this.styles.get(options.voice) ??
      loadVoiceStyle([`${MODEL_BASE}/voice_styles/${options.voice}.json`])
    this.styles.set(options.voice, style)
    if (!isSpeechLanguage(options.language))
      throw new Error(
        `Supertonic does not support ${options.language} speech yet. Choose a supported language override.`,
      )
    const { wav } = await (
      await this.model!
    ).textToSpeech.call(text, options.language, await style, 8, options.speed)
    options.signal?.throwIfAborted()
    const buffer = this.context!.createBuffer(1, wav.length, 44100)
    buffer.copyToChannel(Float32Array.from(wav), 0)
    return buffer
  }
  async dispose() {
    await this.context?.close()
  }
}
