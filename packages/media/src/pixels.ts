export const MAX_DECODE_PIXELS = 40_000_000;

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export function assertSafePixelCount(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('invalid_dimensions');
  }
  if (width * height > MAX_DECODE_PIXELS) {
    throw new Error('pixel_bomb');
  }
}

export function containSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function resizeRgba(source: RgbaImage, width: number, height: number): RgbaImage {
  assertSafePixelCount(width, height);
  if (source.width === width && source.height === height) {
    return { width, height, data: source.data.slice() };
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(source.height - 1, Math.floor((y + 0.5) * (source.height / height)));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(source.width - 1, Math.floor((x + 0.5) * (source.width / width)));
      const src = (srcY * source.width + srcX) * 4;
      const dest = (y * width + x) * 4;
      data[dest] = source.data[src] ?? 0;
      data[dest + 1] = source.data[src + 1] ?? 0;
      data[dest + 2] = source.data[src + 2] ?? 0;
      data[dest + 3] = source.data[src + 3] ?? 255;
    }
  }
  return { width, height, data };
}

export function averageHash(source: RgbaImage): string {
  const tiny = resizeRgba(source, 8, 8);
  const luminances: number[] = [];
  for (let index = 0; index < 64; index += 1) {
    const offset = index * 4;
    const r = tiny.data[offset] ?? 0;
    const g = tiny.data[offset + 1] ?? 0;
    const b = tiny.data[offset + 2] ?? 0;
    luminances.push(Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  }
  const mean = luminances.reduce((sum, value) => sum + value, 0) / 64;
  let bits = 0n;
  for (const value of luminances) {
    bits = (bits << 1n) | (value >= mean ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, '0');
}

export function hammingHex(left: string, right: string): number {
  const a = BigInt(`0x${left}`);
  const b = BigInt(`0x${right}`);
  let xor = a ^ b;
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}
