import { createHash } from 'node:crypto';

import { hammingHex } from './pixels';
import { inspectWebpSize } from './webp-size';

export type ImageSize = { width: number; height: number };

export type QualityFlags = {
  lowResolution: boolean;
  extremeAspect: boolean;
  unknownDimensions: boolean;
  noAudio: boolean;
  unknownDuration: boolean;
  tooLong: boolean;
};

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function inspectImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = readUint32(bytes, 16);
    const height = readUint32(bytes, 20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return inspectJpegSize(bytes);
  }
  return inspectWebpSize(bytes);
}

export function qualityFlags(size: ImageSize | null, extras: Partial<QualityFlags> = {}): QualityFlags {
  if (!size) {
    return {
      lowResolution: false,
      extremeAspect: false,
      unknownDimensions: true,
      noAudio: extras.noAudio ?? false,
      unknownDuration: extras.unknownDuration ?? false,
      tooLong: extras.tooLong ?? false,
    };
  }
  const minEdge = Math.min(size.width, size.height);
  const aspect = size.width / size.height;
  return {
    lowResolution: minEdge < 720,
    extremeAspect: aspect > 2.4 || aspect < 1 / 2.4,
    unknownDimensions: false,
    noAudio: extras.noAudio ?? false,
    unknownDuration: extras.unknownDuration ?? false,
    tooLong: extras.tooLong ?? false,
  };
}

export function proposeDuplicates(input: {
  sha256: string;
  existing: ReadonlyArray<{ id: string; sha256: string | null }>;
}): string[] {
  return input.existing.filter((asset) => asset.sha256 === input.sha256).map((asset) => asset.id);
}

export function proposeNearDuplicates(input: {
  perceptualHash: string;
  existing: ReadonlyArray<{ id: string; perceptualHash: string | null }>;
  maxDistance?: number;
}): string[] {
  const limit = input.maxDistance ?? 8;
  return input.existing
    .filter((asset) => asset.perceptualHash && hammingHex(input.perceptualHash, asset.perceptualHash) <= limit)
    .map((asset) => asset.id);
}

function inspectJpegSize(bytes: Uint8Array): ImageSize | null {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) {
      return null;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = (bytes[offset + 5]! << 8) + bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) + bytes[offset + 8]!;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    const length = (bytes[offset + 2]! << 8) + bytes[offset + 3]!;
    offset += 2 + length;
  }
  return null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}
