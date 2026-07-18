import type { RefObject } from 'react'
import type { HistoryEntry } from '../lib/storage'

type Props = {
  history: HistoryEntry[]
  fileInput: RefObject<HTMLInputElement | null>
  onChoose: (file?: File) => void
  onRecent: (name: string) => void
}

const button =
  'inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-emerald-950 px-5 py-3 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-amber-500'
export function Library({ history, fileInput, onChoose, onRecent }: Props) {
  return (
    <>
      <section
        className="rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-16"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          onChoose(event.dataTransfer.files[0])
        }}
      >
        <h2 className="font-serif text-3xl font-bold sm:text-4xl">
          Choose your PDF
        </h2>
        <p className="my-4">
          Text, scanned, and mixed PDFs up to 500 MB and 1,000 pages. OCR and
          speech stay on this device.
        </p>
        <label className={button}>
          Select PDF
          <input
            ref={fileInput}
            className="sr-only"
            aria-label="Select PDF"
            type="file"
            accept="application/pdf,.pdf"
            onClick={(event) => {
              event.currentTarget.value = ''
            }}
            onChange={(event) => onChoose(event.target.files?.[0])}
          />
        </label>
      </section>
      {!!history.length && (
        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-serif text-3xl font-bold">Recent reading</h2>
          <p className="my-3">
            Reselect the same PDF to resume. Documents are never stored.
          </p>
          {history.map((item) => (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-4 border-t border-stone-200 py-3 text-left transition hover:text-orange-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-slate-800 dark:hover:text-amber-300"
              key={item.fingerprint}
              onClick={() => onRecent(item.name)}
            >
              <span>{item.name}</span>
              <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-sm dark:bg-slate-800">
                {Math.round(((item.chunkIndex + 1) / item.totalChunks) * 100)}%
              </span>
            </button>
          ))}
        </section>
      )}
    </>
  )
}
