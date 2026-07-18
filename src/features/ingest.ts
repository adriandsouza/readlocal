import { disposeOcr, recognizePage } from './ocr'
import {
  normalizeIngestion,
  PDF_TIMEOUT_MS,
  type PdfIngestionResult,
  type ProcessingState,
  type RawPdfPage,
} from './pdf'

type Progress = (state: ProcessingState, message: string) => void

export function ingestPdf(
  file: File,
  signal: AbortSignal,
  progress: Progress,
): Promise<{
  result: PdfIngestionResult
  ocrPages: number
  skippedPages: number
}> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/pdf.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    )
    let timer: ReturnType<typeof setTimeout>
    let pageCount = 0
    let processedPages = 0
    let ocrPages = 0
    let skippedPages = 0
    let settled = false
    const pages: Parameters<typeof normalizeIngestion>[2] = []

    const finish = async (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      signal.removeEventListener('abort', abort)
      await disposeOcr().catch(() => undefined)
      if (error) reject(error)
    }
    const fail = (message: string) => void finish(new Error(message))
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(
        () =>
          fail(
            `PDF processing made no progress for ${Math.round(PDF_TIMEOUT_MS / 1000)} seconds.`,
          ),
        PDF_TIMEOUT_MS,
      )
    }
    const abort = () =>
      void finish(signal.reason ?? new DOMException('Aborted', 'AbortError'))

    signal.addEventListener('abort', abort, { once: true })
    resetTimer()
    worker.onerror = () =>
      fail('PDF processing stopped unexpectedly. Try the file again.')
    worker.onmessage = async ({ data }) => {
      if (signal.aborted) return
      resetTimer()
      if (data.type === 'opened') {
        pageCount = data.pageCount
        progress('extracting', `Extracting ${pageCount} pages locally…`)
        return
      }
      if (data.type === 'error') {
        fail(data.error)
        return
      }
      if (data.type === 'page') {
        const page = data.page as RawPdfPage
        try {
          if (page.quality.usable) {
            pages.push({
              pageNumber: page.pageNumber,
              lines: page.text.split('\n'),
              extractionMethod: 'embedded-text',
            })
          } else {
            progress(
              'ocr',
              `Running OCR on page ${page.pageNumber} of ${pageCount}…`,
            )
            const ocr = await recognizePage(page.ocrImage!, (value) =>
              progress(
                'ocr',
                `OCR page ${page.pageNumber}: ${Math.round(value * 100)}% — processed locally`,
              ),
            )
            if (ocr.kind === 'unreadable') skippedPages++
            else {
              ocrPages++
              pages.push({
                pageNumber: page.pageNumber,
                lines: ocr.text.trim().split('\n'),
                extractionMethod: 'ocr',
                confidence: ocr.confidence,
              })
            }
          }
        } catch (error) {
          fail(
            error instanceof Error
              ? `Page ${page.pageNumber}: ${error.message}`
              : `OCR failed on page ${page.pageNumber}.`,
          )
          return
        }
        processedPages++
        worker.postMessage({ type: 'ack' })
        progress(
          'extracting',
          `Processed ${processedPages} of ${pageCount} pages locally…`,
        )
        return
      }
      if (data.type === 'complete') {
        const result = normalizeIngestion(file.name, pageCount, pages)
        await finish()
        resolve({ result, ocrPages, skippedPages })
      }
    }
    worker.postMessage({ type: 'start', file })
  })
}
