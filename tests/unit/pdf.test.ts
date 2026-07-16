import { cleanPages, isPageNumber, normalizeWhitespace, repeatedMargins, validatePdf } from '../../src/features/pdf'
describe('PDF processing', () => {
  it('validates files', () => { expect(validatePdf({ name:'notes.txt',type:'text/plain',size:2 })).toMatch(/PDF/); expect(validatePdf({name:'book.pdf',type:'application/pdf',size:2})).toBeNull() })
  it('normalizes whitespace', () => expect(normalizeWhitespace('  a\t  b ')).toBe('a b'))
  it('detects repeated margins and page numbers', () => { const pages=[['Title','One','1'],['Title','Two','2'],['Title','Three','3']]; expect(repeatedMargins(pages)).toContain('Title'); expect(isPageNumber('Page 3 of 9')).toBe(true) })
  it('removes margins and merges broken lines', () => { const result=cleanPages([['Header','This is a broken','line.','1'],['Header','Other text.','2'],['Header','Final text.','3']]); expect(result[0].text).toBe('This is a broken line.') })
})
