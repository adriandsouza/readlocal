export const MAX_PDF_BYTES = 500 * 1024 * 1024
export const MAX_PDF_PAGES = 1_000
export const PDF_TIMEOUT_MS = 120_000
export type ProcessingState = 'extracting' | 'ocr' | 'completed' | 'failed'
export type ExtractionMethod = 'embedded-text' | 'ocr'
export type PdfPageResult = {
  pageNumber: number
  text: string
  extractionMethod: ExtractionMethod
  confidence?: number
}
export type PdfIngestionResult = {
  fileName: string
  pageCount: number
  pages: PdfPageResult[]
  fullText: string
}
export type PdfPage = PdfPageResult
export type TextQuality = {
  usable: boolean
  reason?: string
  letterRatio: number
  symbolRatio: number
  normalWordRatio: number
  wordCount: number
}
export type RawPdfPage = {
  pageNumber: number
  text: string
  quality: TextQuality
  ocrImage?: ArrayBuffer
}

export function validatePdf(file: Pick<File, 'size'>): string | null {
  if (file.size === 0) return 'This PDF is empty.'
  if (file.size > MAX_PDF_BYTES)
    return 'This PDF is larger than the 500 MB browser limit.'
  return null
}

export async function validatePdfFile(file: File): Promise<string | null> {
  const basic = validatePdf(file)
  if (basic) return basic
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file.slice(0, 1024))
  })
  const signature = new TextDecoder('latin1').decode(bytes)
  return signature.includes('%PDF-')
    ? null
    : 'This file does not contain a valid PDF signature.'
}

export const normalizeWhitespace = (text: string) =>
  text
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
export const isPageNumber = (line: string) =>
  /^(?:page\s+)?\d+(?:\s+of\s+\d+)?$/i.test(line.trim())

const normalWord = (word: string) =>
  word.length <= 2 ||
  (/^[a-z]+$/i.test(word) &&
    /[aeiouy]/i.test(word) &&
    !/[bcdfghjklmnpqrstvwxz]{4}/i.test(word))

export function evaluateTextQuality(text: string): TextQuality {
  const visible = text.replace(/\s/g, '')
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const invalid = [...text].filter((character) => {
    const code = character.codePointAt(0)!
    return (
      code === 0xfffd ||
      (code < 32 && !/\s/.test(character)) ||
      /\p{Co}/u.test(character)
    )
  }).length
  const symbols = text.match(/[^\p{L}\p{M}\p{N}\p{P}\p{Z}\s]/gu)?.length ?? 0
  const words = text.match(/\p{L}{2,}/gu) ?? []
  const denominator = Math.max(visible.length, 1)
  const letterRatio = letters / denominator
  const symbolRatio = (symbols + invalid * 3) / denominator
  const normalWordRatio =
    words.filter(normalWord).length / Math.max(words.length, 1)
  const hasLatinLetters = /[a-z]/i.test(text)
  let reason: string | undefined
  if (!visible.length) reason = 'empty text layer'
  else if (visible.length < 4) reason = 'extremely sparse text layer'
  else if (invalid > 0 || symbolRatio > 0.12)
    reason = 'excessive invalid or symbolic characters'
  else if (visible.length > 20 && letterRatio < 0.45)
    reason = 'too few readable letters'
  else if (hasLatinLetters && words.length >= 8 && normalWordRatio < 0.55)
    reason = 'implausible word encoding'
  return {
    usable: !reason,
    reason,
    letterRatio,
    symbolRatio,
    normalWordRatio,
    wordCount: words.length,
  }
}

export const shouldUseOcr = (text: string) => !evaluateTextQuality(text).usable

export function validatePageCount(pageCount: number): string | null {
  return pageCount > MAX_PDF_PAGES
    ? `This PDF has ${pageCount.toLocaleString('en-US')} pages; the browser limit is ${MAX_PDF_PAGES.toLocaleString('en-US')}.`
    : null
}

export function friendlyPdfError(message: string): string {
  if (/password|encrypted/i.test(message))
    return 'This PDF is encrypted and could not be opened without a password.'
  if (/invalid pdf|missing pdf|unexpected response/i.test(message))
    return 'This file is not a valid supported PDF.'
  return `PDF processing failed: ${message}`
}

export function repeatedMargins(pages: string[][]): Set<string> {
  const counts = new Map<string, number>()
  for (const lines of pages)
    for (const line of [lines[0], lines.at(-1)])
      if (line) counts.set(line.trim(), (counts.get(line.trim()) ?? 0) + 1)
  return new Set(
    [...counts]
      .filter(([, count]) => pages.length > 2 && count / pages.length >= 0.6)
      .map(([line]) => line),
  )
}

export function cleanPageLines(
  raw: string[],
  margins = new Set<string>(),
): string {
  const lines = raw
    .map(normalizeWhitespace)
    .filter((line) => line && !isPageNumber(line) && !margins.has(line))
  const paragraphs: string[] = []
  for (const line of lines) {
    const previous = paragraphs.at(-1)
    if (
      previous &&
      !/[.!?:;”"]$/.test(previous) &&
      !/^[A-Z][A-Z\s]{2,}$/.test(line)
    )
      paragraphs[paragraphs.length - 1] =
        `${previous}${previous.endsWith('-') ? '' : ' '}${line}`.replace(
          /- /,
          '',
        )
    else paragraphs.push(line)
  }
  return paragraphs.join('\n\n')
}

export function normalizeIngestion(
  fileName: string,
  pageCount: number,
  rawPages: Array<{
    pageNumber: number
    lines: string[]
    extractionMethod: ExtractionMethod
    confidence?: number
  }>,
): PdfIngestionResult {
  const ordered = [...rawPages].sort((a, b) => a.pageNumber - b.pageNumber)
  const margins = repeatedMargins(ordered.map((page) => page.lines))
  const pages = ordered.map((page) => ({
    pageNumber: page.pageNumber,
    text: cleanPageLines(page.lines, margins),
    extractionMethod: page.extractionMethod,
    ...(page.confidence === undefined ? {} : { confidence: page.confidence }),
  }))
  return {
    fileName,
    pageCount,
    pages,
    fullText: pages
      .map((page) => page.text)
      .filter(Boolean)
      .join('\n\n'),
  }
}
