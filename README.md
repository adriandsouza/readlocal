# ReadLocal

Privacy-first, local-only PDF-to-speech reader powered by Supertonic and ONNX Runtime Web.

> Your document stays on your device. PDF extraction and speech generation happen locally in your browser.

## Status

PDF extraction, cleanup, reading UI, progress persistence, PWA shell, queue behavior, and the privacy request guard work. Production Supertonic inference is **not yet enabled**: upstream currently supplies a browser example and model assets rather than a stable browser package API. Development uses clearly labelled silent mock buffers; production fails explicitly. Do not present this release as speech-complete until the upstream `web/` implementation is vendored with its licence notices and tested models.

## How it works

PDF.js extracts text page-by-page inside a worker. Deterministic cleanup removes repeated margins/page numbers and joins broken lines. Small sentence/paragraph chunks enter a cancelable local speech queue. Only voice, playback speed, document fingerprint, and last chunk are stored in IndexedDB; complete text and audio are session-only.

See [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [performance](docs/PERFORMANCE.md), and [browser limitations](docs/BROWSER_LIMITATIONS.md).

## Screenshots

Screenshots will be added after the real Supertonic integration is enabled.

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Install the PWA from the browser’s install action after one online load. The shell reopens offline. Model assets can only be offline after the future production integration downloads and caches them successfully.

## Browser support

Current Chrome and Edge are the primary target. Firefox and Safari use WebAssembly where supported and have tighter background/memory constraints. Background playback is not guaranteed on any browser.

## Network requests

The app shell is fetched from its host. Future model fetches are restricted to Hugging Face’s official asset hosts and contain no document data. There are no analytics, telemetry, remote logs, fonts, runtime scripts, TTS APIs, or backend calls. See the privacy document for exact origins.

## Roadmap

- [ ] Vendor and audit the official Supertonic browser implementation and licence notices
- [ ] Cache legally redistributable Supertonic assets with offline readiness UI
- [ ] Add a generated valid PDF fixture and full speech-mock Playwright flow
- [ ] Add Media Session actions after real playback is connected
- [ ] Improve sentence boundary handling for more languages
- [ ] Investigate local OCR without weakening privacy

## Contributing and licence

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). ReadLocal is MIT licensed. Supertonic code and weights are separate works governed by their upstream licences; no Supertonic models or source are distributed here. Attribute Supertone Inc. and review the applicable model licence before adding assets.
