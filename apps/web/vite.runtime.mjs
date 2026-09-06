import { createReadStream, readFileSync } from 'node:fs'

/** Keep EVA's isolated UI port explicit; never silently move to another service. */
export function resolveWebPort(env = process.env) {
  const value = env.VITE_PORT === undefined || env.VITE_PORT === '' ? '5173' : String(env.VITE_PORT)
  const port = Number(value)
  if (!/^\d{1,5}$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_PORT must be an integer between 1 and 65535')
  }
  return port
}

/** Build emits the asset; dev serves it directly without Rollup-only hooks. */
export function localOcrData(englishTessdata) {
  const publicPath = '/ocr/eng.traineddata.gz'
  return {
    name: 'local-ocr-data',
    generateBundle() {
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
        const stream = createReadStream(englishTessdata)
        stream.on('error', () => {
          if (response.headersSent) {
            response.destroy()
          } else {
            response.statusCode = 500
            response.setHeader('Cache-Control', 'no-store')
            response.end('Local OCR data unavailable')
          }
        })
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/gzip')
        response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        stream.pipe(response)
      })
    },
  }
}
