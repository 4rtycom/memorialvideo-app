import { inflateSync, deflateSync } from 'node:zlib';

import { crc32 } from './crc32';
import { assertSafePixelCount, type RgbaImage } from './pixels';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 33 || !startsWith(bytes, SIGNATURE)) {
    throw new Error('not_png');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Uint8Array[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error('truncated_png');
    }
    const chunk = bytes.subarray(offset + 4, dataEnd);
    if (crc32(chunk) !== readUint32(bytes, dataEnd)) {
      throw new Error('bad_png_crc');
    }
    if (type === 'IHDR') {
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8] ?? 0;
      colorType = bytes[dataStart + 9] ?? 0;
      if ((bytes[dataStart + 10] ?? 0) !== 0 || (bytes[dataStart + 11] ?? 0) !== 0 || (bytes[dataStart + 12] ?? 0) !== 0) {
        throw new Error('unsupported_png');
      }
    }
    if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd));
    }
    if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6 && colorType !== 0)) {
    throw new Error('unsupported_png');
  }
  assertSafePixelCount(width, height);
  const inflated = inflateSync(concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const data = new Uint8Array(width * height * 4);
  let src = 0;
  const prior = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src] ?? 0;
    src += 1;
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const recon = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = row[x] ?? 0;
      const a = x >= channels ? (recon[x - channels] ?? 0) : 0;
      const b = prior[x] ?? 0;
      const c = x >= channels ? (prior[x - channels] ?? 0) : 0;
      recon[x] = (raw + predictor(filter, a, b, c)) & 0xff;
    }
    prior.set(recon);
    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4;
      if (colorType === 0) {
        const gray = recon[x] ?? 0;
        data[dest] = gray;
        data[dest + 1] = gray;
        data[dest + 2] = gray;
        data[dest + 3] = 255;
      } else if (colorType === 2) {
        data[dest] = recon[x * 3] ?? 0;
        data[dest + 1] = recon[x * 3 + 1] ?? 0;
        data[dest + 2] = recon[x * 3 + 2] ?? 0;
        data[dest + 3] = 255;
      } else {
        data[dest] = recon[x * 4] ?? 0;
        data[dest + 1] = recon[x * 4 + 1] ?? 0;
        data[dest + 2] = recon[x * 4 + 2] ?? 0;
        data[dest + 3] = recon[x * 4 + 3] ?? 255;
      }
    }
  }
  return { width, height, data };
}

export function encodePng(image: RgbaImage): Uint8Array {
  assertSafePixelCount(image.width, image.height);
  const raw = new Uint8Array((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowStart = y * (image.width * 4 + 1);
    raw[rowStart] = 0;
    raw.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), rowStart + 1);
  }
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, image.width);
  writeUint32(ihdr, 4, image.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  return concat(chunks);
}

function predictor(filter: number, a: number, b: number, c: number): number {
  if (filter === 0) {
    return 0;
  }
  if (filter === 1) {
    return a;
  }
  if (filter === 2) {
    return b;
  }
  if (filter === 3) {
    return (a + b) >> 1;
  }
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body[0] = type.charCodeAt(0);
  body[1] = type.charCodeAt(1);
  body[2] = type.charCodeAt(2);
  body[3] = type.charCodeAt(3);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);
  out.set(body, 4);
  writeUint32(out, 8 + data.length, crc32(body));
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
