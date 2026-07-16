import type { PdfPage } from './pdf'

export type SpeechStatus = 'pending' | 'generating' | 'ready' | 'playing' | 'played' | 'error'
export type SpeechChunk = { id: string; pageNumber: number; text: string; status: SpeechStatus }
export type SpeechOptions = { voice: string; speed: number; signal?: AbortSignal }
export interface SpeechEngine { initialize(): Promise<void>; synthesize(text: string, options: SpeechOptions): Promise<AudioBuffer>; dispose(): Promise<void> }

export function createSpeechChunks(pages: PdfPage[]): SpeechChunk[] {
  return pages.flatMap((page) => {
    const protectedText = page.text.replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\./gi, '$1∯')
    return protectedText.split(/\n{2,}|(?<=[.!?][”"]?)\s+(?=[A-Z0-9])/).map((text) => text.replaceAll('∯', '.').trim()).filter(Boolean).map((text, i) => ({ id: `${page.pageNumber}-${i}`, pageNumber: page.pageNumber, text, status: 'pending' as const }))
  })
}

export class SpeechQueue {
  private generation = new Map<string, Promise<AudioBuffer>>()
  private controller = new AbortController()
  constructor(private engine: SpeechEngine) {}
  generate(chunk: SpeechChunk, options: Omit<SpeechOptions, 'signal'>) {
    const existing = this.generation.get(chunk.id)
    if (existing) return existing
    const task = this.engine.synthesize(chunk.text, { ...options, signal: this.controller.signal }).finally(() => this.generation.delete(chunk.id))
    this.generation.set(chunk.id, task)
    return task
  }
  cancel() { this.controller.abort(); this.controller = new AbortController(); this.generation.clear() }
  get pending() { return this.generation.size }
}

export class DevelopmentSpeechEngine implements SpeechEngine {
  private context?: AudioContext
  async initialize() { this.context ??= new AudioContext() }
  async synthesize(text: string, options: SpeechOptions) {
    if (!import.meta.env.DEV) throw new Error('Supertonic model assets are not installed.')
    await this.initialize()
    options.signal?.throwIfAborted()
    return this.context!.createBuffer(1, Math.max(8000, text.length * 800), 16000)
  }
  async dispose() { await this.context?.close() }
}
