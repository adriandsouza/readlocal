import {
  detectLanguage,
  hasExpectedScript,
  isSpeechLanguage,
  textDirection,
} from '../../src/features/language'

describe('language detection', () => {
  it('detects scripts and common Latin languages per section', () => {
    expect(detectLanguage('هذا كتاب باللغة العربية')).toBe('ar')
    expect(detectLanguage('これは日本語の文章です')).toBe('ja')
    expect(detectLanguage('这是一本中文书')).toBe('zh')
    expect(detectLanguage('Le livre et la maison de Paris')).toBe('fr')
    expect(
      detectLanguage(
        'Это достаточно длинное предложение на русском языке для определения.',
      ),
    ).toBe('ru')
  })
  it('marks direction and unsupported speech languages', () => {
    expect(textDirection('ar')).toBe('rtl')
    expect(isSpeechLanguage('zh')).toBe(false)
    expect(isSpeechLanguage('ko')).toBe(true)
  })
  it('checks OCR script expectations', () => {
    expect(hasExpectedScript('यह एक हिंदी वाक्य है।', 'hi')).toBe(true)
    expect(hasExpectedScript('This is English text.', 'hi')).toBe(false)
  })
})
