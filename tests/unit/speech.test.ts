import {
  createSpeechChunks,
  hasWebGPU,
  isIOS,
  SpeechQueue,
  type SpeechEngine,
} from '../../src/features/speech'
const buffer = {} as AudioBuffer
describe('speech', () => {
  it('uses the low-memory runtime on iPhone and iPad', () => {
    expect(
      isIOS({ userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 }),
    ).toBe(true)
    expect(
      isIOS({ userAgent: 'Safari', platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(true)
    expect(
      isIOS({ userAgent: 'Chrome', platform: 'Linux', maxTouchPoints: 0 }),
    ).toBe(false)
    expect(hasWebGPU({ gpu: {} })).toBe(true)
    expect(hasWebGPU({})).toBe(false)
  })
  it('chunks paragraphs and sentences in order', () => {
    const chunks = createSpeechChunks([
      {
        pageNumber: 1,
        text: 'Dr. Lane reads 3.14 books. Next sentence.\n\nHeading',
        extractionMethod: 'embedded-text',
      },
    ])
    expect(chunks.map((x) => x.text)).toEqual([
      'Dr. Lane reads 3.14 books.',
      'Next sentence.',
      'Heading',
    ])
  })
  it('deduplicates and cancels generation', async () => {
    let calls = 0
    let signal: AbortSignal | undefined
    const engine: SpeechEngine = {
      initialize: async () => {},
      dispose: async () => {},
      synthesize: async (_text, options) => {
        calls++
        signal = options.signal
        return buffer
      },
    }
    const queue = new SpeechQueue(engine)
    const chunk = {
      id: '1',
      pageNumber: 1,
      paragraph: 0,
      text: 'Hello.',
      status: 'pending' as const,
    }
    const a = queue.generate(chunk, { voice: 'M1', speed: 1 })
    const b = queue.generate(chunk, { voice: 'M1', speed: 1 })
    expect(a).toBe(b)
    await a
    expect(calls).toBe(1)
    const pending = queue.generate(
      { ...chunk, id: '2' },
      { voice: 'M1', speed: 1 },
    )
    queue.cancel()
    await pending
    expect(signal?.aborted).toBe(true)
  })
})
