import {
  evaluateTextQuality,
  friendlyPdfError,
  isPageNumber,
  normalizeIngestion,
  normalizeWhitespace,
  repeatedMargins,
  validatePageCount,
  validatePdf,
  validatePdfFile,
} from '../../src/features/pdf'

describe('PDF ingestion', () => {
  it('validates bytes instead of trusting extension or MIME type', async () => {
    expect(
      await validatePdfFile(
        new File(['not a pdf'], 'book.pdf', { type: 'application/pdf' }),
      ),
    ).toMatch(/signature/)
    expect(
      await validatePdfFile(
        new File(['%PDF-1.7\n'], 'book.txt', { type: 'text/plain' }),
      ),
    ).toBeNull()
  })
  it('rejects empty, oversized, excessive-page, and encrypted inputs', () => {
    expect(validatePdf({ size: 0 })).toMatch(/empty/)
    expect(validatePdf({ size: 501 * 1024 * 1024 })).toMatch(/500 MB/)
    expect(validatePageCount(1001)).toMatch(/1,000/)
    expect(friendlyPdfError('PasswordException')).toMatch(/encrypted/)
  })
  it('accepts normal selectable English text', () =>
    expect(
      evaluateTextQuality(
        'The first law explains how power and reputation influence human behavior.',
      ).usable,
    ).toBe(true))
  it('rejects empty, symbolic, and defective character mappings', () => {
    expect(evaluateTextQuality('').usable).toBe(false)
    expect(evaluateTextQuality('\ufffd\ufffd\u0001%%%'.repeat(10)).usable).toBe(
      false,
    )
    expect(
      evaluateTextQuality(
        'Yedjqdji Qrxzpmk Yedjqdji Qrxzpmk Yedjqdji Qrxzpmk Yedjqdji Qrxzpmk.',
      ).usable,
    ).toBe(false)
  })
  it('normalizes mixed embedded-text and OCR pages', () => {
    const result = normalizeIngestion([
      {
        pageNumber: 2,
        lines: ['THE 48 LAWS OF POWER'],
        extractionMethod: 'ocr',
        confidence: 92,
      },
      {
        pageNumber: 1,
        lines: ['Readable first page.'],
        extractionMethod: 'embedded-text',
      },
    ])
    expect(result.pages).toEqual([
      {
        pageNumber: 1,
        text: 'Readable first page.',
        extractionMethod: 'embedded-text',
      },
      {
        pageNumber: 2,
        text: 'THE 48 LAWS OF POWER',
        extractionMethod: 'ocr',
        confidence: 92,
      },
    ])
  })
  it('normalizes whitespace, page numbers, and repeated margins', () => {
    expect(normalizeWhitespace('  a\t  b ')).toBe('a b')
    expect(isPageNumber('Page 3 of 9')).toBe(true)
    expect(
      repeatedMargins([
        ['Title', 'One', '1'],
        ['Title', 'Two', '2'],
        ['Title', 'Three', '3'],
      ]),
    ).toContain('Title')
  })
})
