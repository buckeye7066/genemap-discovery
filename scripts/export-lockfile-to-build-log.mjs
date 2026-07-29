import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const raw = fs.readFileSync('pnpm-lock.yaml');
const encoded = zlib.gzipSync(raw, { level: 9 }).toString('base64');
const chunkSize = 6000;
const chunkCount = Math.ceil(encoded.length / chunkSize);
const sleeper = new Int32Array(new SharedArrayBuffer(4));

console.log(
  `LOCKMETA:raw=${raw.length}:encoded=${encoded.length}:sha256=${crypto
    .createHash('sha256')
    .update(raw)
    .digest('hex')}:chunkSize=${chunkSize}:chunkCount=${chunkCount}`
);

for (let index = 0; index < chunkCount; index += 1) {
  const chunk = encoded.slice(index * chunkSize, (index + 1) * chunkSize);
  console.log(`LOCKCHUNK:${String(index).padStart(3, '0')}:${chunk}`);
  Atomics.wait(sleeper, 0, 0, 1200);
}

console.log('LOCKEND');
