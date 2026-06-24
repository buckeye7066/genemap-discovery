import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// `mode === 'desktop'` is passed by the Electron build (`vite build --mode desktop`).
// The packaged app loads index.html over the file:// protocol, where root-absolute
// asset URLs (Vite's default base '/') resolve to the drive root and 404 — the classic
// Electron "white screen". Relative base './' fixes that. The web build (Vercel) keeps
// base '/' because it serves behind a router that needs root-absolute asset URLs for
// deep-link reloads.
export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? './' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      // During local development the @genemap/shared package main entry
      // points at ./dist (production-safe). To avoid having to rebuild
      // the shared package on every edit, alias the package directly to
      // its TypeScript source so Vite can transform it on the fly. The
      // production build (Vercel/Docker) uses the compiled dist via the
      // package.json `exports` field — this alias only affects local dev.
      '@genemap/shared/client': path.resolve(__dirname, '../../packages/shared/src/client.ts'),
      '@genemap/shared/schemas': path.resolve(__dirname, '../../packages/shared/src/schemas.ts'),
      '@genemap/shared/types': path.resolve(__dirname, '../../packages/shared/src/types.ts'),
      '@genemap/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
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
          'vendor-3d': ['three'],
          'vendor-markdown': ['react-markdown'],
          'vendor-utils': ['clsx', 'tailwind-merge', 'class-variance-authority', 'date-fns'],
          'vendor-canvas': ['html2canvas'],
        },
      },
    },
  },
}))
