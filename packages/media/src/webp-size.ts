import type { ImageSize } from './inspect';

export function isLosslessWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 16 && bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c;
}

export function inspectWebpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) {
    return null;
  }
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return null;
  }
  const chunk = String.fromCharCode(bytes[12] ?? 0, bytes[13] ?? 0, bytes[14] ?? 0, bytes[15] ?? 0);
  if (chunk === 'VP8X') {
    const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
    const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = (bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8);
    const height = (bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8);
    return width > 0 && height > 0 ? { width: width & 0x3fff, height: height & 0x3fff } : null;
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits =
      (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}
