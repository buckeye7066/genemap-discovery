#!/usr/bin/env node
/**
 * Dependency-free icon generator for GeneMap Discovery.
 *
 * electron-builder needs icons/icon.ico (Windows) and icons/icon.icns (macOS),
 * and main.js loads icons/icon.png for the window. The repo shipped none, so a
 * desktop build hard-fails. Rather than pull in a native image toolchain
 * (sharp / png-to-ico), this script renders the brand mark from scratch:
 *
 *   1. draw an RGBA bitmap (Ohio State scarlet/gray tile + DNA double-helix),
 *   2. encode it as PNG using only Node's built-in zlib,
 *   3. wrap the PNG into .ico and .icns container formats (both can embed a
 *      PNG payload directly), no external binaries required.
 *
 * It also emits PWA PNGs into apps/web/public/icons so the manifest /
 * apple-touch-icon references in Layout.jsx resolve instead of 404ing.
 *
 * Run: node apps/desktop/scripts/generate-icons.mjs   (or `pnpm build:icons`)
 */
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopIcons = path.join(__dirname, '..', 'icons');
const webIcons = path.join(__dirname, '..', '..', 'web', 'public', 'icons');

// PNG encoder (zlib only)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Artwork
function lerp(a, b, t) { return a + (b - a) * t; }

function render(size) {
  const buf = Buffer.alloc(size * size * 4); // transparent
  const radius = size * 0.22;

  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const i = (y * size + x) * 4;
    const dstA = buf[i + 3] / 255;
    const srcA = a;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    buf[i] = Math.round((r * srcA + buf[i] * dstA * (1 - srcA)) / outA);
    buf[i + 1] = Math.round((g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA);
    buf[i + 2] = Math.round((b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA);
    buf[i + 3] = Math.round(outA * 255);
  };

  // Rounded-rect gradient tile (Ohio State scarlet -> deep scarlet).
  const inRounded = (x, y) => {
    const rx = Math.max(0, radius - x, x - (size - 1 - radius));
    const ry = Math.max(0, radius - y, y - (size - 1 - radius));
    return Math.hypot(rx, ry) <= radius;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRounded(x, y)) continue;
      const t = (x + y) / (2 * size);
      blend(x, y, Math.round(lerp(186, 74, t)), Math.round(lerp(12, 5, t)), Math.round(lerp(47, 19, t)), 1);
    }
  }

  // Fine gray diagonal lines keep the mark from becoming a flat red square.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRounded(x, y)) continue;
      const stripe = (x + y) % Math.max(16, Math.round(size * 0.16));
      if (stripe < Math.max(1, Math.round(size * 0.01))) {
        blend(x, y, 167, 177, 183, 0.22);
      }
    }
  }

  // DNA double helix: two phase-shifted sine strands with connecting rungs.
  const cx = size / 2;
  const amp = size * 0.16;
  const top = size * 0.26;
  const bot = size * 0.74;
  const turns = 2.0;
  const node = Math.max(2, size * 0.035);

  const disc = (px, py, r, col, alpha) => {
    for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
      for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
        const d = Math.hypot(x - px, y - py);
        if (d <= r) blend(x, y, col[0], col[1], col[2], alpha * Math.min(1, (r - d) + 0.5));
      }
    }
  };

  const steps = 28;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const y = lerp(top, bot, t);
    const phase = t * turns * Math.PI * 2;
    const xA = cx + amp * Math.sin(phase);
    const xB = cx - amp * Math.sin(phase);
    // rung
    if (s % 3 === 0) {
      const rsteps = 12;
      for (let k = 0; k <= rsteps; k++) {
        const rx = lerp(xA, xB, k / rsteps);
        disc(rx, y, node * 0.45, [167, 177, 183], 0.55);
      }
    }
    // strands (front strand brighter)
    const frontFirst = Math.sin(phase) >= 0;
    disc(xA, y, node, [255, 255, 255], frontFirst ? 1 : 0.75);
    disc(xB, y, node, [255, 255, 255], frontFirst ? 0.75 : 1);
  }

  return buf;
}

// Container wrappers
function pngToIco(png256) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // width 256 encoded as 0
  entry[1] = 0; // height 256 encoded as 0
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png256.length, 8);
  entry.writeUInt32LE(22, 12); // offset = 6 + 16
  return Buffer.concat([header, entry, png256]);
}
function pngsToIcns(entries) {
  const parts = entries.map(({ type, png }) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(png.length + 8, 0);
    return Buffer.concat([Buffer.from(type, 'ascii'), len, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// Emit
mkdirSync(desktopIcons, { recursive: true });
mkdirSync(webIcons, { recursive: true });

const png512 = encodePNG(512, render(512));
const png256 = encodePNG(256, render(256));
const png192 = encodePNG(192, render(192));

writeFileSync(path.join(desktopIcons, 'icon.png'), png512);
writeFileSync(path.join(desktopIcons, 'icon.ico'), pngToIco(png256));
writeFileSync(path.join(desktopIcons, 'icon.icns'), pngsToIcns([
  { type: 'ic08', png: png256 },
  { type: 'ic09', png: png512 },
]));

// PWA assets referenced by Layout.jsx (apple-touch-icon + manifest).
writeFileSync(path.join(webIcons, 'icon-192.png'), png192);
writeFileSync(path.join(webIcons, 'icon-512.png'), png512);

console.log('Generated desktop icons (png/ico/icns) and web PWA icons (192/512).');
