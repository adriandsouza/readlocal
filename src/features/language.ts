import { franc } from 'franc-min'

export const SUPERTONIC_LANGUAGES = [
  'ar',
  'bg',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'et',
  'fi',
  'fr',
  'de',
  'el',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'lv',
  'lt',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'es',
  'sv',
  'tr',
  'uk',
  'vi',
] as const
export type Language = (typeof SUPERTONIC_LANGUAGES)[number] | 'zh'

const words: Partial<Record<Language, string[]>> = {
  en: ['the', 'and', 'of', 'to', 'is'],
  fr: ['le', 'la', 'les', 'de', 'et'],
  es: ['el', 'la', 'los', 'de', 'que'],
  de: ['der', 'die', 'das', 'und', 'ist'],
  it: ['il', 'la', 'di', 'che', 'e'],
  pt: ['o', 'a', 'de', 'que', 'e'],
}
const iso3: Record<string, Language> = {
  arb: 'ar',
  bul: 'bg',
  hrv: 'hr',
  ces: 'cs',
  dan: 'da',
  nld: 'nl',
  eng: 'en',
  est: 'et',
  fin: 'fi',
  fra: 'fr',
  deu: 'de',
  ell: 'el',
  hin: 'hi',
  hun: 'hu',
  ind: 'id',
  ita: 'it',
  jpn: 'ja',
  kor: 'ko',
  lav: 'lv',
  lit: 'lt',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rus: 'ru',
  slk: 'sk',
  slv: 'sl',
  spa: 'es',
  swe: 'sv',
  tur: 'tr',
  ukr: 'uk',
  vie: 'vi',
}

export function detectLanguage(text: string): Language {
  if (/\p{Script=Arabic}/u.test(text)) return 'ar'
  if (/\p{Script=Devanagari}/u.test(text)) return 'hi'
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(text)) return 'ja'
  if (/\p{Script=Hangul}/u.test(text)) return 'ko'
  if (/\p{Script=Han}/u.test(text)) return 'zh'
  const detected = iso3[franc(text, { minLength: 20 })]
  if (detected) return detected
  const tokens = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? []
  let best: Language = 'en'
  let score = 0
  for (const [language, common] of Object.entries(words) as [
    Language,
    string[],
  ][]) {
    const next = tokens.filter((token) => common.includes(token)).length
    if (next > score) {
      best = language
      score = next
    }
  }
  return best
}

export const textDirection = (language: Language) =>
  language === 'ar' ? 'rtl' : 'ltr'
export const isSpeechLanguage = (
  language: Language,
): language is (typeof SUPERTONIC_LANGUAGES)[number] =>
  (SUPERTONIC_LANGUAGES as readonly string[]).includes(language)

export function hasExpectedScript(text: string, language: Language) {
  if (language === 'ar') return /\p{Script=Arabic}/u.test(text)
  if (language === 'hi') return /\p{Script=Devanagari}/u.test(text)
  if (language === 'ja')
    return /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(text)
  if (language === 'ko') return /\p{Script=Hangul}/u.test(text)
  if (language === 'zh') return /\p{Script=Han}/u.test(text)
  return true
}
