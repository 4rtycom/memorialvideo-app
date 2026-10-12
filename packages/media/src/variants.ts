import { sha256Hex } from './inspect';
import { decodeJpeg, encodeJpeg } from './jpeg-codec';
import { averageHash, containSize, resizeRgba, type RgbaImage } from './pixels';
import { decodePng, encodePng } from './png-codec';
import { decodeWebp } from './webp-codec';
import { isLosslessWebp } from './webp-size';
import { sniffMime, type SniffedMime } from './sniff';
import { opaqueVariantKey, VARIANT_BUCKET } from './upload';

export const VARIANT_PROCESSING_VERSION = 'v1';

export const VARIANT_TARGETS = {
  thumbnail: { maxWidth: 320, maxHeight: 320 },
  preview: { maxWidth: 1280, maxHeight: 1280 },
  normalized: { maxWidth: 1920, maxHeight: 1920 },
  poster: { maxWidth: 1920, maxHeight: 1080 },
} as const;

export type VariantType = keyof typeof VARIANT_TARGETS;

export type VariantProvenance = {
  sourceMethod: string;
  provider: string;
  providerModel: string;
  providerVersion: string;
};

export type BuiltVariant = {
  variantType: VariantType;
  processingVersion: typeof VARIANT_PROCESSING_VERSION;
  storageBucket: typeof VARIANT_BUCKET;
  storageKey: string;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
  bytes: Uint8Array;
  provenance?: VariantProvenance;
};

export type VariantBuildResult = {
  variants: BuiltVariant[];
  perceptualHash: string | null;
  skipped: string[];
  reject?: 'pixel_bomb' | 'undecodable';
};

export function decodeRaster(bytes: Uint8Array, mime: SniffedMime = sniffMime(bytes)): RgbaImage {
  if (mime === 'image/png') {
    return decodePng(bytes);
  }
  if (mime === 'image/jpeg') {
    return decodeJpeg(bytes);
  }
  if (mime === 'image/webp' && isLosslessWebp(bytes)) {
    return decodeWebp(bytes);
  }
  throw new Error('undecodable');
}

export async function decodeRasterAsync(
  bytes: Uint8Array,
  mime: SniffedMime = sniffMime(bytes),
): Promise<RgbaImage> {
  try {
    return decodeRaster(bytes, mime);
  } catch (error) {
    if (mime === 'image/webp') {
      const { decodeLossyWebp } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ './lossy-webp');
      return decodeLossyWebp(bytes);
    }
    throw error instanceof Error ? error : new Error('undecodable');
  }
}

export async function buildImageVariants(input: {
  projectId: string;
  assetId: string;
  bytes: Uint8Array;
}): Promise<VariantBuildResult> {
  const mime = sniffMime(input.bytes);
  const skipped: string[] = [];
  let image: RgbaImage;
  try {
    image = await decodeRasterAsync(input.bytes, mime);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'undecodable';
    return {
      variants: [],
      perceptualHash: null,
      skipped: ['decode'],
      reject: message === 'pixel_bomb' ? 'pixel_bomb' : 'undecodable',
    };
  }
  const outputMime = mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const variants = (['thumbnail', 'preview', 'normalized'] as const).map((variantType) => {
    const target = VARIANT_TARGETS[variantType];
    const size = containSize(image.width, image.height, target.maxWidth, target.maxHeight);
    const resized = resizeRgba(image, size.width, size.height);
    const encoded = outputMime === 'image/jpeg' ? encodeJpeg(resized) : encodePng(resized);
    return {
      variantType,
      processingVersion: VARIANT_PROCESSING_VERSION,
      storageBucket: VARIANT_BUCKET,
      storageKey: opaqueVariantKey(input.projectId, input.assetId, `${variantType}-${VARIANT_PROCESSING_VERSION}`),
      mime: outputMime,
      width: resized.width,
      height: resized.height,
      sizeBytes: encoded.byteLength,
      checksum: sha256Hex(encoded),
      bytes: encoded,
    } satisfies BuiltVariant;
  });
  return {
    variants,
    perceptualHash: averageHash(image),
    skipped,
  };
}

export function buildPosterFromFrame(input: {
  projectId: string;
  assetId: string;
  frame: RgbaImage;
  provenance?: VariantProvenance;
}): BuiltVariant {
  const size = containSize(input.frame.width, input.frame.height, 1920, 1080);
  const resized = resizeRgba(input.frame, size.width, size.height);
  const encoded = encodePng(resized);
  return {
    variantType: 'poster',
    processingVersion: VARIANT_PROCESSING_VERSION,
    storageBucket: VARIANT_BUCKET,
    storageKey: opaqueVariantKey(input.projectId, input.assetId, `poster-${VARIANT_PROCESSING_VERSION}`),
    mime: 'image/png',
    width: resized.width,
    height: resized.height,
    sizeBytes: encoded.byteLength,
    checksum: sha256Hex(encoded),
    bytes: encoded,
    provenance: input.provenance,
  };
}

export function buildPosterFromJpegBytes(input: {
  projectId: string;
  assetId: string;
  jpeg: Uint8Array;
  provenance?: VariantProvenance;
}): BuiltVariant {
  return buildPosterFromFrame({
    projectId: input.projectId,
    assetId: input.assetId,
    frame: decodeJpeg(input.jpeg),
    provenance: input.provenance,
  });
}
