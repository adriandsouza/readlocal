import { createWorker, OEM, PSM, type LoggerMessage } from 'tesseract.js'
import { shouldUseOcr } from './pdf'

let active: Awaited<ReturnType<typeof createWorker>> | undefined

function withTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out.',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function recognizePage(
  image: ArrayBuffer,
  onProgress?: (progress: number) => void,
  timeoutMs = 60_000,
) {
  if (!active) {
    active = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr',
      langPath: '/ocr',
      logger: (message: LoggerMessage) =>
        message.status === 'recognizing text' && onProgress?.(message.progress),
    })
    await active.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
  }
  const result = await withTimeout(
    active.recognize(new Blob([image], { type: 'image/png' }), {
      rotateAuto: true,
    }),
    timeoutMs,
    `OCR timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
  )
  const text = result.data.text.trim()
  if (!text || shouldUseOcr(text)) return { kind: 'unreadable' as const }
  return {
    kind: 'readable' as const,
    text,
    confidence: result.data.confidence,
    warnings: result.data.confidence < 70 ? ['Low OCR confidence.'] : [],
  }
}

export async function disposeOcr() {
  await active?.terminate()
  active = undefined
}

export { withTimeout, shouldUseOcr }
