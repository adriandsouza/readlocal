# Browser limitations

PDF extraction needs module workers. IndexedDB or private-mode quotas can prevent progress persistence. WebGPU is fastest in current Chromium browsers; ONNX Runtime Web can use WebAssembly elsewhere. Model memory requirements may exceed mobile limits. Browsers may suspend tabs, audio, workers, or Media Session activity, so uninterrupted background playback cannot be guaranteed. Scanned and password-protected PDFs are unsupported.
