import {
  resolveOcrLanguage,
  shouldUseOcr,
  withTimeout,
} from '../../src/features/ocr'

describe('OCR fallback', () => {
  it('uses OCR for empty and corrupt text layers', () => {
    expect(shouldUseOcr('')).toBe(true)
    expect(shouldUseOcr('\u0001\u0002\u0003'.repeat(20))).toBe(true)
  })
  it('does not OCR valid short title pages', () =>
    expect(shouldUseOcr('Page 1')).toBe(false))
  it('keeps a healthy selectable text layer', () =>
    expect(
      shouldUseOcr(
        'This is a complete readable paragraph with enough text for reliable extraction.',
      ),
    ).toBe(false))
  it('uses the page script for auto OCR language selection', () => {
    expect(resolveOcrLanguage('यह एक सरल हिंदी वाक्य है।', 'auto')).toBe('hin')
    expect(resolveOcrLanguage('Readable English text.', 'en')).toBe('eng')
  })
  it('fails bounded OCR work with a clear timeout', async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 1, 'OCR timeout'),
    ).rejects.toThrow('OCR timeout')
  })
})
