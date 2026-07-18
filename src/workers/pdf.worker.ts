import {
  getDocument,
  GlobalWorkerOptions,
  PDFDataRangeTransport,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import {
  evaluateTextQuality,
  friendlyPdfError,
  validatePageCount,
  type RawPdfPage,
} from '../features/pdf'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

let acknowledge: (() => void) | undefined

self.onmessage = ({
  data,
}: MessageEvent<{ type: 'ack' } | { type: 'start'; file: File }>) => {
  if (data.type === 'ack') {
    acknowledge?.()
    return
  }
  void ingest(data.file)
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

async function ingest(file: File) {
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
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      const reader = page.streamTextContent().getReader()
      const items = []
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        items.push(...value.items)
      }
      const text = items
        .map((item) =>
          'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '',
        )
        .join('')
        .trim()
      const quality = evaluateTextQuality(text)
      const result: RawPdfPage = { pageNumber: number, text, quality }
      if (!quality.usable) {
        if (
          typeof OffscreenCanvas === 'undefined' ||
          typeof OffscreenCanvas.prototype.convertToBlob !== 'function'
        )
          throw new Error(
            'Scanned PDF pages require iOS 16.4 or newer on iPhone and iPad.',
          )
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
