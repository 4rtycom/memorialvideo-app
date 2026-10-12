import { assertSafePixelCount, type RgbaImage } from './pixels';

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

class BitWriter {
  bits = 0n;
  count = 0;
  bytes: number[] = [];

  write(value: number, width: number): void {
    this.bits |= BigInt(value) << BigInt(this.count);
    this.count += width;
    while (this.count >= 8) {
      this.bytes.push(Number(this.bits & 0xffn));
      this.bits >>= 8n;
      this.count -= 8;
    }
  }

  finish(): Uint8Array {
    if (this.count > 0) {
      this.bytes.push(Number(this.bits & 0xffn));
    }
    return Uint8Array.from(this.bytes);
  }
}

class BitReader {
  constructor(
    private readonly bytes: Uint8Array,
    private offset = 0,
    private bit = 0,
  ) {}

  read(width: number): number {
    let value = 0;
    for (let index = 0; index < width; index += 1) {
      const byte = this.bytes[this.offset] ?? 0;
      value |= ((byte >> this.bit) & 1) << index;
      this.bit += 1;
      if (this.bit === 8) {
        this.bit = 0;
        this.offset += 1;
      }
    }
    return value;
  }
}

export function encodeLosslessWebp(image: RgbaImage): Uint8Array {
  assertSafePixelCount(image.width, image.height);
  const payload = new BitWriter();
  payload.write(0x2f, 8);
  payload.write(image.width - 1, 14);
  payload.write(image.height - 1, 14);
  payload.write(1, 1);
  payload.write(0, 3);
  payload.write(0, 1);
  payload.write(0, 1);
  writeFlatHuffman(payload, 256 + 24);
  writeFlatHuffman(payload, 256);
  writeFlatHuffman(payload, 256);
  writeFlatHuffman(payload, 256);
  writeFlatHuffman(payload, 40);
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    const a = image.data[offset + 3] ?? 255;
    writeSymbol8(payload, g);
    writeSymbol8(payload, r);
    writeSymbol8(payload, b);
    writeSymbol8(payload, a);
  }
  const encoded = payload.finish();
  const riff = new Uint8Array(20 + encoded.length);
  riff.set([0x52, 0x49, 0x46, 0x46], 0);
  writeLe32(riff, 4, riff.length - 8);
  riff.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c], 8);
  writeLe32(riff, 16, encoded.length);
  riff.set(encoded, 20);
  return riff;
}

export function decodeWebp(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 21 || bytes[8] !== 0x57 || bytes[12] !== 0x56 || bytes[15] !== 0x4c) {
    throw new Error('undecodable');
  }
  const size = bytes[16]! | (bytes[17]! << 8) | (bytes[18]! << 16) | (bytes[19]! << 24);
  const bitstream = bytes.subarray(20, 20 + size);
  const reader = new BitReader(bitstream);
  if (reader.read(8) !== 0x2f) {
    throw new Error('undecodable');
  }
  const width = reader.read(14) + 1;
  const height = reader.read(14) + 1;
  reader.read(1);
  reader.read(3);
  assertSafePixelCount(width, height);
  if (reader.read(1) !== 0 || reader.read(1) !== 0) {
    throw new Error('undecodable');
  }
  readFlatHuffman(reader, 256 + 24);
  readFlatHuffman(reader, 256);
  readFlatHuffman(reader, 256);
  readFlatHuffman(reader, 256);
  readFlatHuffman(reader, 40);
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const g = readSymbol8(reader);
    const r = readSymbol8(reader);
    const b = readSymbol8(reader);
    const a = readSymbol8(reader);
    data.set([r, g, b, a], index * 4);
  }
  return { width, height, data };
}

function writeFlatHuffman(writer: BitWriter, alphabet: number): void {
  writer.write(0, 1);
  writer.write(8, 4);
  for (let index = 0; index < 12; index += 1) {
    writer.write(CODE_LENGTH_ORDER[index] === 8 ? 1 : CODE_LENGTH_ORDER[index] === 0 ? 1 : 0, 3);
  }
  for (let symbol = 0; symbol < alphabet; symbol += 1) {
    writer.write(symbol < 256 ? 1 : 0, 1);
  }
}

function readFlatHuffman(reader: BitReader, alphabet: number): void {
  if (reader.read(1) !== 0) {
    throw new Error('undecodable');
  }
  const count = reader.read(4) + 4;
  for (let index = 0; index < count; index += 1) {
    reader.read(3);
  }
  for (let symbol = 0; symbol < alphabet; symbol += 1) {
    reader.read(1);
  }
}

function writeSymbol8(writer: BitWriter, value: number): void {
  let encoded = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    encoded |= ((value >> bit) & 1) << (7 - bit);
  }
  writer.write(encoded, 8);
}

function readSymbol8(reader: BitReader): number {
  let value = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    value |= reader.read(1) << bit;
  }
  return value;
}

function writeLe32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
