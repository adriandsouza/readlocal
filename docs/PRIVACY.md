# Privacy

PDF bytes, extracted text, and audio remain in browser memory and are never sent by application code. ReadLocal stores only voice, speed, and a fingerprint/last chunk for each opened document. Complete text and audio are not persisted. “Clear local data” removes these records.

Expected network requests are limited to the application shell, PDF.js/ONNX Runtime assets served by the same origin, and—once the production integration is installed—official Supertonic model and voice assets from `huggingface.co` or `cdn-lfs.huggingface.co`. Model requests contain no document metadata or content and the service worker may cache them. There is no backend because local extraction and inference provide the product’s privacy boundary.

The CSP restricts connections to those origins. A Playwright request guard checks that PDF processing emits no third-party request. Browser extensions, the hosting provider, and browser implementation behavior remain outside the application’s control.
