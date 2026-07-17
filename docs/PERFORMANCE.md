# Performance

PDF parsing and page rendering run in a module worker backed by bounded file-range reads. OCR is per-page and only used when text is empty/sparse, symbol-heavy, contains invalid characters, or has implausible word structure. Failed pages are rendered near 300 DPI as bounded JPEGs. The worker waits for OCR acknowledgement before continuing, then releases page resources.

Supertonic generates one sentence at a time with eight denoising steps. The next sentence is prefetched during playback. The queue retains no more than three decoded `AudioBuffer` objects and releases unrelated buffers after navigation.

The same-origin Supertonic models are approximately 398 MB, ONNX Runtime's fallback binary is approximately 27 MB, and bundled OCR languages/cores are approximately 132 MB. First use is therefore network-, storage-, and memory-sensitive. The service worker caches model assets after successful use when quota permits; browsers may evict them.

WebGPU is preferred. WebAssembly is slower but preserves local operation. Very large scanned books should be processed on desktop hardware with sufficient memory.

The 476-page `48laws.pdf` regression has a broken text map on effectively every page. On the development machine it processed about 80 pages in three minutes, projecting roughly 18 minutes for full local OCR. The reader becomes available after the first 5 pages; later 5-page batches append in the background. A representative 25-page slice exercises both early publication and final OCR in regression testing.
