# Performance

PDF extraction runs in a worker and speech is chunked. Development Performance API entries cover extraction, cleanup, and per-chunk generation; they are never transmitted. The queue deduplicates work, cancels on document changes, and generates only on demand. Future real-model integration should retain at most the current and two look-ahead buffers.
