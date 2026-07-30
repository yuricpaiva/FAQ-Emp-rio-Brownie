import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw-v2.js',
      registerType: 'prompt',
      injectRegister: null,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,webmanifest}']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      },
      manifest: {
        name: 'FAQ EB',
        short_name: 'FAQ EB',
        description: 'Central interna FAQ EB',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4eee7',
        theme_color: '#3f2418',
        icons: [
          {
            src: '/pwa/faq-eb-pwa-icon-192-v2.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/faq-eb-pwa-icon-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa/faq-eb-pwa-icon-maskable-512-v2.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
