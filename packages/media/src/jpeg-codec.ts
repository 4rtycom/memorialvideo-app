import jpeg from 'jpeg-js';

import { assertSafePixelCount, type RgbaImage } from './pixels';

const MAX_MEMORY_MB = 64;

export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  const decoded = jpeg.decode(Buffer.from(bytes), {
    useTArray: true,
    maxMemoryUsageInMB: MAX_MEMORY_MB,
    maxResolutionInMP: 40,
  });
  assertSafePixelCount(decoded.width, decoded.height);
  return {
    width: decoded.width,
    height: decoded.height,
    data: Uint8Array.from(decoded.data),
  };
}

export function encodeJpeg(image: RgbaImage, quality = 82): Uint8Array {
  assertSafePixelCount(image.width, image.height);
  const encoded = jpeg.encode(
    {
      data: Buffer.from(image.data),
      width: image.width,
      height: image.height,
    },
    quality,
  );
  return new Uint8Array(encoded.data);
}
