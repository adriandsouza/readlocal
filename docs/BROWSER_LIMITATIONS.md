# Browser limitations

- WebGPU performs best in current Chromium browsers. Firefox and Safari generally use WebAssembly.
- Private mode and storage quotas can prevent IndexedDB progress or model caching.
- Browsers may evict cached models, suspend background tabs/audio, or terminate memory-heavy OCR/model workers.
- A large scanned book can be slow because every image page must be rendered and recognized locally.
- Password-protected or structurally corrupt PDFs are rejected.
- Broken text maps normally trigger OCR, but unusual layouts and handwriting can still produce poor recognition.
- PDF ingestion fallback currently uses English OCR, matching the defective-text regression target. Other bundled OCR languages remain available for future routing.
- Speech support depends on the selected local model; ReadLocal will report unsupported speech languages clearly and keep OCR/display separate from playback.
- ReadLocal does not persist document bytes. To resume after closing, reselect the same PDF; progress resumes at the saved sentence.
- Background playback and Media Session integration are not yet guaranteed.
