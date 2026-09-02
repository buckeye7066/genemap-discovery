import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createReadStream, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'path'

const require = createRequire(import.meta.url)
const tessdataPackage = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'))
const englishTessdata = path.join(tessdataPackage, '4.0.0_best_int', 'eng.traineddata.gz')

function localOcrData() {
  const publicPath = '/ocr/eng.traineddata.gz'
  return {
    name: 'local-ocr-data',
    buildStart() {
      this.emitFile({
        type: 'asset',
        fileName: publicPath.slice(1),
        source: readFileSync(englishTessdata),
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname
        if (pathname !== publicPath) return next()
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/gzip')
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        createReadStream(englishTessdata).pipe(response)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localOcrData()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // The browser gets the bounded HTTP client, never the shared package
      // barrel. The old internal persona registry contains unrestricted agent
      // charters; the published assistants instead use the bounded client and
      // server-owned /assistants context contract.
      '@genemap/shared/client': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
      '@genemap/shared/schemas': path.resolve(__dirname, '../../packages/shared/src/schemas.ts'),
      '@genemap/shared/types': path.resolve(__dirname, '../../packages/shared/src/types.ts'),
      '@genemap/shared/associationClaim': path.resolve(__dirname, '../../packages/shared/src/associationClaim.ts'),
      '@genemap/shared/publicationStatus': path.resolve(__dirname, '../../packages/shared/src/publicationStatus.ts'),
      '@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    cssMinify: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
          ],
          'vendor-icons': ['lucide-react'],
          'vendor-charts': ['recharts'],
          'vendor-markdown': ['react-markdown'],
          'vendor-utils': ['clsx', 'tailwind-merge', 'class-variance-authority', 'date-fns'],
          'vendor-canvas': ['html2canvas'],
        },
      },
    },
  },
})
