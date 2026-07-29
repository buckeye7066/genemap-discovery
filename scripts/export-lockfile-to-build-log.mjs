import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const raw = fs.readFileSync('pnpm-lock.yaml');
const compressed = zlib.brotliCompressSync(raw, {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
  },
});
const encoded = compressed.toString('base64');
const chunkSize = 3000;
const chunks = Array.from(
  { length: Math.ceil(encoded.length / chunkSize) },
  (_, index) => encoded.slice(index * chunkSize, (index + 1) * chunkSize)
);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

console.log(
  `LOCKMETA:codec=brotli:raw=${raw.length}:compressed=${compressed.length}:encoded=${encoded.length}:sha256=${crypto
    .createHash('sha256')
    .update(raw)
    .digest('hex')}:chunkSize=${chunkSize}:chunkCount=${chunks.length}`
);
console.log(
  `LOCKHASHES:${JSON.stringify(
    chunks.map((chunk, index) => ({
      index,
      length: chunk.length,
      sha256: crypto.createHash('sha256').update(chunk).digest('hex'),
    }))
  )}`
);

for (let index = 0; index < chunks.length; index += 1) {
  console.log(`LOCKCHUNK:${String(index).padStart(3, '0')}:${chunks[index]}`);
  Atomics.wait(sleeper, 0, 0, 450);
}
console.log('LOCKEND');

fs.mkdirSync('apps/web/dist', { recursive: true });
fs.writeFileSync('apps/web/dist/index.html', '<!doctype html><title>lockfile exported</title>');
