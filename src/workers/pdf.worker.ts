import { getDocument } from 'pdfjs-dist'
import { cleanPages } from '../features/pdf'

self.onmessage = async ({ data }: MessageEvent<ArrayBuffer>) => {
  const started = performance.now()
  try {
    const pdf = await getDocument({ data }).promise
    const raw: string[][] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent()
      raw.push(content.items.map((item) => ('str' in item ? item.str : '')).join('\n').split('\n'))
    }
    const cleanupStarted = performance.now()
    const pages = cleanPages(raw)
    self.postMessage({ pages, metrics: { extractionMs: cleanupStarted - started, cleanupMs: performance.now() - cleanupStarted } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read this PDF.'
    self.postMessage({ error: /password/i.test(message) ? 'Password-protected PDFs are not supported.' : 'This PDF is corrupted or unsupported.' })
  }
}
