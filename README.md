# ReadLocal

![ReadLocal meme banner](docs/readlocal-meme.png)

Yes. That’s literally the point.

Private, English PDF-to-speech in your browser. PDF text, OCR, and Supertonic speech generation stay on the device: there is no backend, account, analytics, upload, or cloud TTS.

## What it does

- Reads selectable, scanned, and mixed PDFs up to 500 MB or 1,000 pages
- Falls back to local English Tesseract OCR only for weak text layers
- Loads the complete document before reading, then starts from any selected sentence
- Runs Supertonic with WebGPU when available and WebAssembly otherwise
- Supports continuous play, pause/resume, voice, speed, bookmarks, and exact resume
- Installs as a PWA and uses same-origin runtime assets

## Develop

Requires Node.js 22+.

```bash
npm install
npm run models:download
npm run dev
```

Models are ignored by Git. `models:download` pins Supertonic 3, Tesseract 7, and English OCR data. Set `READLOCAL_MODEL_DIR` for a custom model directory.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Playwright covers Chromium and WebKit. Optional real-book regressions use local, uncommitted files:

```bash
READLOCAL_LARGE_PDF="$HOME/Downloads/large-book.pdf" npm run test:e2e -- -g "large PDF"
READLOCAL_OCR_REGRESSION_PDF="$HOME/Downloads/ocr-regression.pdf" npm run test:e2e -- -g "defective text layer"
```

## Design

The PDF worker reads bounded file ranges, extracts each text layer, and renders only rejected pages for OCR. The main thread normalizes the completed result and keeps at most three generated audio buffers. PDF bytes, extracted text, and audio are session-only; IndexedDB stores only preferences, reading position, recent names, and bookmarks.

See [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [performance](docs/PERFORMANCE.md), and [browser limitations](docs/BROWSER_LIMITATIONS.md).

ReadLocal is MIT licensed. Supertonic weights use OpenRAIL-M; Tesseract.js uses Apache-2.0.
