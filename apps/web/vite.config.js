import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createRequire } from 'node:module'
import path from 'path'
import { releaseIdentityJson } from './lib/releaseIdentity.js'
import { localOcrData, resolveWebPort } from './vite.runtime.mjs'

const require = createRequire(import.meta.url)
const tessdataPackage = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'))
const englishTessdata = path.join(tessdataPackage, '4.0.0_best_int', 'eng.traineddata.gz')

function releaseIdentity() {
  const publicPath = '/release.json'
  const source = () => releaseIdentityJson(process.env)
  return {
    name: 'release-identity',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: publicPath.slice(1),
        source: source(),
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname
        if (pathname !== publicPath) return next()
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        response.end(source())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localOcrData(englishTessdata), releaseIdentity()],
  server: {
    host: '127.0.0.1',
    port: resolveWebPort(process.env),
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
