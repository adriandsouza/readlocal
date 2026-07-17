import {
  getDocument,
  GlobalWorkerOptions,
  PDFDataRangeTransport,
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  evaluateTextQuality,
  friendlyPdfError,
  prioritizedPageOrder,
  validatePageCount,
  type RawPdfPage,
} from '../features/pdf'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

let acknowledge: (() => void) | undefined

self.onmessage = ({
  data,
}: MessageEvent<
  { type: 'ack' } | { type: 'start'; file: File; priorityPage?: number }
>) => {
  if (data.type === 'ack') {
    acknowledge?.()
    return
  }
  void ingest(data.file, data.priorityPage)
}

class FileRangeTransport extends PDFDataRangeTransport {
  private aborted = false
  constructor(private file: File) {
    super(file.size, null)
  }
  requestDataRange(begin: number, end: number) {
    if (!this.aborted)
      void this.file
        .slice(begin, end)
        .arrayBuffer()
        .then((bytes) => {
          if (!this.aborted) this.onDataRange(begin, new Uint8Array(bytes))
        })
  }
  abort() {
    this.aborted = true
  }
}

async function emitPage(page: RawPdfPage) {
  const transfer = page.ocrImage ? [page.ocrImage] : []
  await new Promise<void>((resolve) => {
    acknowledge = resolve
    self.postMessage({ type: 'page', page }, { transfer })
  })
  acknowledge = undefined
}

async function openDocument(file: File, useRange = true) {
  if (useRange) {
    const range = new FileRangeTransport(file)
    try {
      const loading = getDocument({
        range,
        disableAutoFetch: true,
        disableStream: true,
        useSystemFonts: true,
      })
      const pdf = await loading.promise
      return {
        pdf,
        cleanup: () => loading.destroy().finally(() => range.abort()),
      }
    } catch (error) {
      range.abort()
      throw error
    }
  }
  const data = new Uint8Array(await file.arrayBuffer())
  const loading = getDocument({ data, useSystemFonts: true })
  const pdf = await loading.promise
  return { pdf, cleanup: () => loading.destroy() }
}

async function ingest(file: File, priorityPage?: number) {
  const started = performance.now()
  try {
    let opened
    try {
      opened = await openDocument(file)
    } catch (firstError) {
      opened = await openDocument(file, false).catch((secondError) => {
        throw secondError instanceof Error ? secondError : firstError
      })
    }
    const { pdf, cleanup } = opened
    const pageCountError = validatePageCount(pdf.numPages)
    if (pageCountError) throw new Error(pageCountError)
    self.postMessage({ type: 'opened', pageCount: pdf.numPages })
    for (const number of prioritizedPageOrder(pdf.numPages, priorityPage)) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) =>
          'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '',
        )
        .join('')
        .trim()
      const quality = evaluateTextQuality(text)
      const result: RawPdfPage = { pageNumber: number, text, quality }
      if (!quality.usable) {
        const base = page.getViewport({ scale: 1 })
        const scale = Math.min(
          300 / 72,
          4096 / Math.max(base.width, base.height),
        )
        const viewport = page.getViewport({ scale })
        const canvas = new OffscreenCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        )
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext(
            '2d',
          )! as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise
        result.ocrImage = await (
          await canvas.convertToBlob({ type: 'image/png' })
        ).arrayBuffer()
      }
      await emitPage(result)
      page.cleanup()
    }
    const pageCount = pdf.numPages
    await cleanup()
    self.postMessage({
      type: 'complete',
      pageCount,
      durationMs: Math.round(performance.now() - started),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not read this PDF.'
    const friendly = message.includes('browser limit')
      ? message
      : friendlyPdfError(message)
    self.postMessage({ type: 'error', error: friendly })
  }
}
