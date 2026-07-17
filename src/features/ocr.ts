import { createWorker, OEM, PSM, type LoggerMessage } from 'tesseract.js'
import { detectLanguage, type Language } from './language'
import { shouldUseOcr } from './pdf'

let active: Awaited<ReturnType<typeof createWorker>> | undefined
let activeLanguage = ''

const OCR_LANGS: Record<Language, string> = {
  ar: 'ara',
  bg: 'eng',
  cs: 'eng',
  da: 'eng',
  de: 'deu',
  el: 'eng',
  en: 'eng',
  es: 'spa',
  et: 'eng',
  fi: 'eng',
  fr: 'fra',
  hi: 'hin',
  hr: 'eng',
  hu: 'eng',
  id: 'eng',
  it: 'ita',
  ja: 'jpn',
  ko: 'kor',
  lt: 'eng',
  lv: 'eng',
  nl: 'eng',
  pl: 'eng',
  pt: 'por',
  ro: 'eng',
  ru: 'eng',
  sk: 'eng',
  sl: 'eng',
  sv: 'eng',
  tr: 'eng',
  uk: 'eng',
  vi: 'eng',
  zh: 'chi_sim',
}

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

function resolveOcrLanguage(text: string, language: Language | 'auto') {
  const detected = language === 'auto' ? detectLanguage(text) : language
  return OCR_LANGS[detected] ?? 'eng'
}

export async function recognizePage(
  image: ArrayBuffer,
  language: Language | 'auto',
  onProgress?: (progress: number) => void,
  timeoutMs = 60_000,
) {
  const ocrLanguage = resolveOcrLanguage('', language)
  if (!active || activeLanguage !== ocrLanguage) {
    await active?.terminate()
    activeLanguage = ocrLanguage
    active = await createWorker(ocrLanguage, OEM.LSTM_ONLY, {
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
  if (!text || shouldUseOcr(text))
    throw new Error('Local OCR could not find readable text on this page.')
  return {
    text,
    confidence: result.data.confidence,
    language: detectLanguage(text),
    warnings: result.data.confidence < 70 ? ['Low OCR confidence.'] : [],
  }
}

export async function disposeOcr() {
  await active?.terminate()
  active = undefined
  activeLanguage = ''
}

export { withTimeout, resolveOcrLanguage, shouldUseOcr }
