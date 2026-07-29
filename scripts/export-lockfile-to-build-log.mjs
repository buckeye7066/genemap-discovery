import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const raw = fs.readFileSync('pnpm-lock.yaml');
const encoded = zlib.gzipSync(raw, { level: 9 }).toString('base64');
const chunkSize = 6000;
const chunks = Array.from(
  { length: Math.ceil(encoded.length / chunkSize) },
  (_, index) => encoded.slice(index * chunkSize, (index + 1) * chunkSize)
);

console.log(
  `LOCKMETA:raw=${raw.length}:encoded=${encoded.length}:sha256=${crypto
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

fs.mkdirSync('apps/web/dist', { recursive: true });
fs.writeFileSync('apps/web/dist/index.html', '<!doctype html><title>lockfile checksummed</title>');
