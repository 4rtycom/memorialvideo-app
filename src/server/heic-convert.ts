import convert from 'heic-convert';

export type HeicConvertResult =
  | { ok: true; jpeg: Buffer; byteSize: number }
  | { ok: false; reason: string };

/**
 * Convert HEIC/HEIF still bytes to JPEG (quality 0.92).
 * Pure JS/WASM via heic-convert — no silent invention of pixels beyond decode+encode.
 */
export async function convertHeicBufferToJpeg(input: Uint8Array): Promise<HeicConvertResult> {
  if (input.byteLength < 12) {
    return { ok: false, reason: 'too_small' };
  }
  try {
    const out = await convert({
      buffer: input,
      format: 'JPEG',
      quality: 0.92,
    });
    const jpeg = Buffer.from(out);
    if (jpeg.byteLength < 32 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg[2] !== 0xff) {
      return { ok: false, reason: 'invalid_jpeg_output' };
    }
    return { ok: true, jpeg, byteSize: jpeg.byteLength };
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }
}
