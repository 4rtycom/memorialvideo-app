import { deflateSync } from 'node:zlib';

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(4 + 4);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  const crcInput = Buffer.concat([header.subarray(4), data]);
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([header, data, footer]);
}

export function encodePng(width: number, height: number, rgb: readonly [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const shade = 0.82 + 0.18 * Math.sin((x + y) / 24);
      const offset = rowStart + 1 + x * 3;
      raw[offset] = Math.min(255, Math.round(rgb[0] * shade));
      raw[offset + 1] = Math.min(255, Math.round(rgb[1] * shade));
      raw[offset + 2] = Math.min(255, Math.round(rgb[2] * shade));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
