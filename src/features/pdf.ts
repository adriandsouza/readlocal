export const MAX_PDF_BYTES = 100 * 1024 * 1024
export type PdfPage = { pageNumber: number; text: string }

export function validatePdf(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.'
  if (file.size === 0) return 'This PDF is empty.'
  if (file.size > MAX_PDF_BYTES) return 'This PDF is larger than the 100 MB limit.'
  return null
}

export const normalizeWhitespace = (text: string) => text.replace(/[\t\u00a0]+/g, ' ').replace(/ {2,}/g, ' ').trim()
export const isPageNumber = (line: string) => /^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i.test(line.trim())

export function repeatedMargins(pages: string[][]): Set<string> {
  const counts = new Map<string, number>()
  for (const lines of pages) for (const line of [lines[0], lines.at(-1)]) if (line) counts.set(line.trim(), (counts.get(line.trim()) ?? 0) + 1)
  return new Set([...counts].filter(([, count]) => pages.length > 2 && count / pages.length >= 0.6).map(([line]) => line))
}

export function cleanPages(rawPages: string[][]): PdfPage[] {
  const margins = repeatedMargins(rawPages)
  return rawPages.map((raw, index) => {
    const lines = raw.map(normalizeWhitespace).filter((line) => line && !isPageNumber(line) && !margins.has(line))
    const paragraphs: string[] = []
    for (const line of lines) {
      const previous = paragraphs.at(-1)
      if (previous && !/[.!?:;”"]$/.test(previous) && !/^[A-Z][A-Z\s]{2,}$/.test(line)) paragraphs[paragraphs.length - 1] = `${previous}${previous.endsWith('-') ? '' : ' '}${line}`.replace(/- /, '')
      else paragraphs.push(line)
    }
    return { pageNumber: index + 1, text: paragraphs.join('\n\n') }
  })
}
