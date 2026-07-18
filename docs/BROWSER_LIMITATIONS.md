# Browser limitations

- Current Chromium browsers usually provide the fastest WebGPU path. Safari and Firefox use WebAssembly when WebGPU is unavailable.
- iPhone and iPad scanned-PDF support requires `OffscreenCanvas.convertToBlob` (iOS 16.4 or newer).
- Large models, OCR, and decoded audio compete for device memory. Mobile browsers may evict cached assets, suspend background audio, or reload a memory-heavy tab.
- The app currently recognizes and speaks English only.
- Unusual layouts, handwriting, and low-resolution scans may remain unreadable after OCR; those pages are skipped with a warning.
- Offline use works after the application and required assets have been successfully cached, subject to browser storage eviction.
