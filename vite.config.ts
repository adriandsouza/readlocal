import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  publicDir: loadEnv(mode, '.', '').READLOCAL_MODEL_DIR || 'models',
  server: { allowedHosts: ['.ngrok-free.app'] },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ReadLocal',
        short_name: 'ReadLocal',
        description:
          'Privacy-first multilingual PDF-to-speech reader powered by Supertonic.',
        theme_color: '#173b35',
        background_color: '#f5f1e8',
        display: 'standalone',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/ocr\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-ocr',
              expiration: { maxEntries: 60, maxAgeSeconds: 31536000 },
            },
          },
        ],
      },
    }),
  ],
}))
