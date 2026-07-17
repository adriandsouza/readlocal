import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'

function pdf(text: string) {
  const stream = `BT /F1 18 Tf 72 720 Td ${text
    .split('\n')
    .map((line, index) => `${index ? '0 -30 Td ' : ''}(${line}) Tj`)
    .join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body)
}

test('extracts a local PDF without external requests', async ({ page }) => {
  const unexpected: string[] = []
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:5173') &&
      !request.url().startsWith('blob:')
    )
      unexpected.push(request.url())
  })
  await page.goto('/')
  await expect(
    page.getByText('Your documents never leave your device.'),
  ).toBeVisible()
  await page.getByLabel('Select PDF').setInputFiles({
    name: 'readlocal-book.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('ReadLocal book text.'),
  })
  await expect(page.getByText('ReadLocal book text.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Page 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start here' })).toBeVisible()
  await expect(page.getByLabel('Jump to PDF page')).toHaveValue('1')
  await expect(
    page.getByText('Embedded text extracted locally. Ready to play.'),
  ).toBeVisible()
  expect(unexpected).toEqual([])
})

test('persists the selected theme', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Theme').selectOption('dark')
  await expect(page.locator('main')).toHaveClass(/dark/)
  await page.reload()
  await expect(page.getByLabel('Theme')).toHaveValue('dark')
  await expect(page.locator('main')).toHaveClass(/dark/)
})

test('changing voice keeps the current reading position', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Select PDF').setInputFiles({
    name: 'two-paragraphs.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('First paragraph.\nSecond paragraph.'),
  })
  await expect(page.getByText('Second paragraph.')).toBeVisible()
  await page.getByRole('button', { name: 'Next paragraph' }).click()
  await expect(page.getByText('Second paragraph.')).toHaveClass(
    /active-sentence/,
  )

  await page.getByLabel('Voice').selectOption('F1')
  await expect(page.getByText('Second paragraph.')).toHaveClass(
    /active-sentence/,
  )
})

test('saves and removes a private PDF bookmark', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Select PDF').setInputFiles({
    name: 'bookmarks.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('A sentence worth returning to.'),
  })
  await expect(page.getByText('A sentence worth returning to.')).toBeVisible()

  await page.getByRole('button', { name: 'Add bookmark' }).click()
  const bookmarks = page.getByLabel('Bookmarks')
  await expect(bookmarks).toContainText('Page 1')
  await expect(bookmarks).toContainText('A sentence worth returning to.')
  await expect(page.getByRole('button', { name: 'Bookmarked' })).toBeDisabled()

  await page.getByRole('button', { name: 'Remove bookmark on page 1' }).click()
  await expect(bookmarks).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Add bookmark' })).toBeEnabled()
})

test('recent reading opens the PDF picker', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('readlocal', 1)
        request.onupgradeneeded = () =>
          request.result.createObjectStore('local')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const transaction = request.result.transaction('local', 'readwrite')
          transaction.objectStore('local').put(
            [
              {
                fingerprint: 'book',
                name: '48laws.pdf',
                chunkIndex: 20,
                totalChunks: 100,
                updatedAt: Date.now(),
              },
            ],
            'history',
          )
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        }
      }),
  )
  await page.reload()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /48laws\.pdf/ }).click()
  await chooser
  await expect(page.getByRole('status')).toContainText(
    'Select “48laws.pdf” to resume.',
  )
})

test('48laws defective text layer is recovered with OCR when fixture is available', async ({
  page,
}) => {
  test.setTimeout(600_000)
  const fixture =
    process.env.READLOCAL_48LAWS_PDF ??
    path.resolve('tests/fixtures/48laws.pdf')
  test.skip(
    !existsSync(fixture),
    'Place 48laws.pdf at tests/fixtures/48laws.pdf to run this regression.',
  )
  await page.goto('/')
  await page.getByLabel('Document language').selectOption('en')
  await page.getByLabel('Select PDF').setInputFiles(fixture)
  await expect(page.getByText(/5 of \d+ pages ready/)).toBeVisible({
    timeout: 180_000,
  })
  await expect(page.getByText(/recovered with local OCR/)).toBeVisible({
    timeout: 600_000,
  })
  const extracted = await page.getByLabel('Extracted document text').innerText()
  expect(extracted).toMatch(/48 laws|law 1|never outshine the master/i)
  expect(extracted).not.toContain('Yedjqdji')
})

test('runs English OCR entirely from same-origin assets', async ({ page }) => {
  const unexpected: string[] = []
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:5173') &&
      !request.url().startsWith('blob:')
    )
      unexpected.push(request.url())
  })
  await page.goto('/')
  const text = await page.evaluate(async () => {
    const { recognizePage, disposeOcr } = await import('/src/features/ocr.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 180
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'
    context.font = '64px sans-serif'
    context.fillText('Private local reading', 40, 115)
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), 'image/png'),
    )
    const result = await recognizePage(await blob.arrayBuffer(), 'en')
    await disposeOcr()
    return result.text
  })
  expect(text).toContain('Private local reading')
  expect(unexpected).toEqual([])
})
