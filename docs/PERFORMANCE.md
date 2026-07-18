# Performance

PDF parsing and rendering run in a worker using bounded range reads. OCR runs only for empty, sparse, corrupt, or implausible text layers. Rejected pages are rendered as bounded PNGs and released after OCR.

Supertonic prefers WebGPU and falls back to WebAssembly. Speech is generated per sentence; the next sentence is prefetched and only three decoded buffers are retained. The first run is slower because the large same-origin model assets must be fetched and compiled. Browser HTTP caching may avoid later transfers, but storage eviction remains browser-controlled.

Large scanned books are CPU-intensive because every page requires rendering and OCR. The UI deliberately waits for the full PDF so page order, resume position, and playback remain stable.
