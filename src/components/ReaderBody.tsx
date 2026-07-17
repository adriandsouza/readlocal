import { useMemo } from 'react'
import type { PdfIngestionResult, ProcessingState } from '../features/pdf'
import type { SpeechChunk } from '../features/speech'
import type { Bookmark } from '../lib/storage'

type Props = {
  ingestion: PdfIngestionResult
  processing?: ProcessingState
  chunks: SpeechChunk[]
  index: number
  elapsed: number
  speed: number
  bookmarks: Bookmark[]
  onAddBookmark: () => void
  onOpenBookmark: (bookmark: Bookmark) => void
  onRemoveBookmark: (bookmark: Bookmark) => void
  onStartPage: (page: number) => void
}

const button =
  'inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full border border-slate-400 bg-transparent px-4 py-2 font-bold text-emerald-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-600 dark:text-slate-100'
const select =
  'min-h-10 rounded-md border border-slate-400 bg-white px-2 text-emerald-950 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

export function ReaderBody({
  ingestion,
  processing,
  chunks,
  index,
  elapsed,
  speed,
  bookmarks,
  onAddBookmark,
  onOpenBookmark,
  onRemoveBookmark,
  onStartPage,
}: Props) {
  const current = chunks[index]
  const pages = useMemo(
    () =>
      chunks.reduce<
        Array<{
          pageNumber: number
          entries: Array<{ chunk: SpeechChunk; index: number }>
        }>
      >((groups, chunk, chunkIndex) => {
        const page = groups.at(-1)
        const entry = { chunk, index: chunkIndex }
        if (page?.pageNumber === chunk.pageNumber) page.entries.push(entry)
        else groups.push({ pageNumber: chunk.pageNumber, entries: [entry] })
        return groups
      }, []),
    [chunks],
  )
  const remainingMinutes = Math.max(
    0,
    Math.ceil(
      chunks
        .slice(index)
        .reduce((words, chunk) => words + chunk.text.split(/\s+/).length, 0) /
        160 /
        speed,
    ),
  )
  const bookmarked = bookmarks.some((item) => item.chunkId === current?.id)

  return (
    <>
      {processing !== 'completed' && (
        <p className="my-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {ingestion.pages.length} of {ingestion.pageCount} pages ready ·
          Remaining pages are processing locally
        </p>
      )}
      <div className="mt-4 flex justify-between gap-4">
        <span>Page {current?.pageNumber ?? 1}</span>
        <span>
          {chunks.length ? Math.round(((index + 1) / chunks.length) * 100) : 0}%
        </span>
      </div>
      <progress
        className="w-full accent-orange-600"
        aria-label="Reading progress"
        value={index + 1}
        max={chunks.length}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-slate-500 dark:text-slate-400">
        <span>
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}{' '}
          read
        </span>
        <span>~{remainingMinutes} min remaining</span>
        <span>{current?.language.toUpperCase()}</span>
        <button
          className={button}
          disabled={!current || bookmarked}
          onClick={onAddBookmark}
        >
          {bookmarked ? 'Bookmarked' : 'Add bookmark'}
        </button>
        <label className="flex items-center gap-2">
          Jump to page{' '}
          <select
            className={select}
            aria-label="Jump to PDF page"
            value={current?.pageNumber ?? pages[0]?.pageNumber ?? 1}
            onChange={(event) =>
              globalThis.document
                .getElementById(`pdf-page-${event.target.value}`)
                ?.scrollIntoView({ block: 'start' })
            }
          >
            {pages.map((page) => (
              <option key={page.pageNumber} value={page.pageNumber}>
                {page.pageNumber}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!!bookmarks.length && (
        <section
          className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
          aria-label="Bookmarks"
        >
          <h3 className="mb-2 font-bold">Bookmarks</h3>
          <ul className="space-y-2">
            {bookmarks.map((bookmark) => (
              <li className="flex items-center gap-2" key={bookmark.chunkId}>
                <button
                  className="min-w-0 flex-1 cursor-pointer rounded-lg px-3 py-2 text-left hover:bg-stone-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:hover:bg-slate-700"
                  onClick={() => onOpenBookmark(bookmark)}
                >
                  <strong className="mr-2">Page {bookmark.pageNumber}</strong>
                  <span className="text-slate-600 dark:text-slate-300">
                    {bookmark.text}
                  </span>
                </button>
                <button
                  className={`${button} shrink-0 px-3`}
                  aria-label={`Remove bookmark on page ${bookmark.pageNumber}`}
                  onClick={() => onRemoveBookmark(bookmark)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <article
        className="my-6 max-h-[46vh] overflow-auto scroll-smooth leading-7 motion-reduce:scroll-auto"
        aria-label="Extracted document text"
      >
        {pages.map((page) => (
          <section
            className="scroll-mt-4 border-b-2 border-stone-200 py-4 last:border-0 dark:border-slate-800"
            id={`pdf-page-${page.pageNumber}`}
            key={page.pageNumber}
            aria-labelledby={`pdf-page-heading-${page.pageNumber}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-3 py-2 backdrop-blur dark:bg-slate-900/95">
              <div className="flex min-w-0 flex-col gap-1">
                <h3
                  className="text-xs font-bold tracking-widest text-slate-500 uppercase dark:text-slate-400"
                  id={`pdf-page-heading-${page.pageNumber}`}
                >
                  Page {page.pageNumber}
                </h3>
              </div>
              <button
                className={button}
                onClick={() => onStartPage(page.pageNumber)}
              >
                Start here
              </button>
            </div>
            {page.entries.map(({ chunk, index: chunkIndex }) => (
              <p
                key={chunk.id}
                id={`speech-chunk-${chunk.id}`}
                lang={chunk.language}
                dir={chunk.direction}
                className={`my-0.5 rounded-md px-3 py-1 ${
                  chunkIndex === index
                    ? 'active-sentence bg-amber-200 font-semibold text-emerald-950 dark:bg-amber-400 dark:text-slate-950'
                    : chunk.pageNumber === current?.pageNumber &&
                        chunk.paragraph === current?.paragraph
                      ? 'bg-amber-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {chunk.text}
              </p>
            ))}
          </section>
        ))}
      </article>
    </>
  )
}
