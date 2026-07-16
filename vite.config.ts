import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({ registerType: 'autoUpdate', manifest: { name: 'ReadLocal', short_name: 'ReadLocal', description: 'Private local PDF-to-speech reader', theme_color: '#173b35', background_color: '#f5f1e8', display: 'standalone', icons: [] }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,wasm}'], runtimeCaching: [{ urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs\.huggingface\.co)\//, handler: 'CacheFirst', options: { cacheName: 'supertonic-models', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } } }] } })],
})
