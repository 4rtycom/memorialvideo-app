import {
  ENHANCEMENT_OPERATION_KINDS,
  enhancementTechnicalReportSchema,
  type EnhancementOperation,
  type EnhancementOperationKind,
  type EnhancementTechnicalReport,
} from '@memorialvideo/contracts';

import { encodeJpeg } from './jpeg-codec';
import { assertSafePixelCount, resizeRgba, type RgbaImage } from './pixels';
import { sniffMime } from './sniff';
import { decodeRaster } from './variants';

export const MAX_ENHANCEMENT_TARGET_PIXELS = 8_294_400; // 3840×2160
export const MAX_ENHANCEMENT_OUTPUT_BYTES = 12_000_000;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cloneImage(source: RgbaImage): RgbaImage {
  return { width: source.width, height: source.height, data: source.data.slice() };
}

function rotateRgba(source: RgbaImage, degrees: 90 | 180 | 270): RgbaImage {
  if (degrees === 180) {
    const data = new Uint8Array(source.data.length);
    for (let index = 0; index < source.width * source.height; index += 1) {
      const src = index * 4;
      const dest = (source.width * source.height - 1 - index) * 4;
      data[dest] = source.data[src] ?? 0;
      data[dest + 1] = source.data[src + 1] ?? 0;
      data[dest + 2] = source.data[src + 2] ?? 0;
      data[dest + 3] = source.data[src + 3] ?? 255;
    }
    return { width: source.width, height: source.height, data };
  }
  const width = source.height;
  const height = source.width;
  assertSafePixelCount(width, height);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const src = (y * source.width + x) * 4;
      const destX = degrees === 90 ? source.height - 1 - y : y;
      const destY = degrees === 90 ? x : source.width - 1 - x;
      const dest = (destY * width + destX) * 4;
      data[dest] = source.data[src] ?? 0;
      data[dest + 1] = source.data[src + 1] ?? 0;
      data[dest + 2] = source.data[src + 2] ?? 0;
      data[dest + 3] = source.data[src + 3] ?? 255;
    }
  }
  return { width, height, data };
}

function mapPixels(source: RgbaImage, map: (r: number, g: number, b: number, a: number) => [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(source.data.length);
  for (let offset = 0; offset < source.data.length; offset += 4) {
    const [r, g, b, a] = map(
      source.data[offset] ?? 0,
      source.data[offset + 1] ?? 0,
      source.data[offset + 2] ?? 0,
      source.data[offset + 3] ?? 255,
    );
    data[offset] = clampByte(r);
    data[offset + 1] = clampByte(g);
    data[offset + 2] = clampByte(b);
    data[offset + 3] = clampByte(a);
  }
  return { width: source.width, height: source.height, data };
}

function adjustExposure(source: RgbaImage, strength: number): RgbaImage {
  const factor = 1 + (strength - 0.5) * 1.2;
  return mapPixels(source, (r, g, b, a) => [r * factor, g * factor, b * factor, a]);
}

function adjustContrast(source: RgbaImage, strength: number): RgbaImage {
  const factor = 1 + (strength - 0.5) * 1.4;
  return mapPixels(source, (r, g, b, a) => [
    (r - 128) * factor + 128,
    (g - 128) * factor + 128,
    (b - 128) * factor + 128,
    a,
  ]);
}

function adjustSaturation(source: RgbaImage, strength: number): RgbaImage {
  const factor = strength * 2;
  return mapPixels(source, (r, g, b, a) => {
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    return [gray + (r - gray) * factor, gray + (g - gray) * factor, gray + (b - gray) * factor, a];
  });
}

function adjustWhiteBalance(source: RgbaImage, strength: number): RgbaImage {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const count = source.width * source.height;
  for (let offset = 0; offset < source.data.length; offset += 4) {
    rSum += source.data[offset] ?? 0;
    gSum += source.data[offset + 1] ?? 0;
    bSum += source.data[offset + 2] ?? 0;
  }
  const rMean = rSum / count || 1;
  const gMean = gSum / count || 1;
  const bMean = bSum / count || 1;
  const gray = (rMean + gMean + bMean) / 3;
  const blend = strength;
  const rScale = 1 + ((gray / rMean) - 1) * blend;
  const gScale = 1 + ((gray / gMean) - 1) * blend;
  const bScale = 1 + ((gray / bMean) - 1) * blend;
  return mapPixels(source, (r, g, b, a) => [r * rScale, g * gScale, b * bScale, a]);
}

function adjustHighlightsShadows(source: RgbaImage, strength: number, mode: 'highlights' | 'shadows'): RgbaImage {
  const amount = (strength - 0.5) * 80;
  return mapPixels(source, (r, g, b, a) => {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const weight =
      mode === 'highlights' ? Math.max(0, (luma - 160) / 95) : Math.max(0, (128 - luma) / 128);
    const delta = amount * weight;
    return [r + delta, g + delta, b + delta, a];
  });
}

function boxBlur(source: RgbaImage, radius: number): RgbaImage {
  const r = Math.max(1, Math.min(3, Math.round(radius)));
  const data = new Uint8Array(source.data.length);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = Math.min(source.height - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = Math.min(source.width - 1, Math.max(0, x + dx));
          const src = (yy * source.width + xx) * 4;
          rSum += source.data[src] ?? 0;
          gSum += source.data[src + 1] ?? 0;
          bSum += source.data[src + 2] ?? 0;
          aSum += source.data[src + 3] ?? 255;
          count += 1;
        }
      }
      const dest = (y * source.width + x) * 4;
      data[dest] = Math.round(rSum / count);
      data[dest + 1] = Math.round(gSum / count);
      data[dest + 2] = Math.round(bSum / count);
      data[dest + 3] = Math.round(aSum / count);
    }
  }
  return { width: source.width, height: source.height, data };
}

function sharpen(source: RgbaImage, strength: number): RgbaImage {
  const blurred = boxBlur(source, 1);
  const amount = strength * 1.4;
  const data = new Uint8Array(source.data.length);
  for (let offset = 0; offset < source.data.length; offset += 1) {
    const original = source.data[offset] ?? 0;
    const soft = blurred.data[offset] ?? 0;
    data[offset] = clampByte(original + (original - soft) * amount);
  }
  return { width: source.width, height: source.height, data };
}

function detectBorder(source: RgbaImage): { left: number; top: number; right: number; bottom: number } | null {
  const threshold = 18;
  const sample = (x: number, y: number) => {
    const offset = (y * source.width + x) * 4;
    return {
      r: source.data[offset] ?? 0,
      g: source.data[offset + 1] ?? 0,
      b: source.data[offset + 2] ?? 0,
    };
  };
  const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.abs(a.r - b.r) <= threshold && Math.abs(a.g - b.g) <= threshold && Math.abs(a.b - b.b) <= threshold;

  const corner = sample(0, 0);
  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;
  for (let x = 0; x < Math.floor(source.width / 4); x += 1) {
    if (!near(sample(x, Math.floor(source.height / 2)), corner)) break;
    left = x + 1;
  }
  for (let x = source.width - 1; x >= Math.floor((source.width * 3) / 4); x -= 1) {
    if (!near(sample(x, Math.floor(source.height / 2)), corner)) break;
    right = source.width - x;
  }
  for (let y = 0; y < Math.floor(source.height / 4); y += 1) {
    if (!near(sample(Math.floor(source.width / 2), y), corner)) break;
    top = y + 1;
  }
  for (let y = source.height - 1; y >= Math.floor((source.height * 3) / 4); y -= 1) {
    if (!near(sample(Math.floor(source.width / 2), y), corner)) break;
    bottom = source.height - y;
  }
  if (left + right >= source.width / 2 || top + bottom >= source.height / 2) {
    return null;
  }
  if (left + right + top + bottom < 8) {
    return null;
  }
  return { left, top, right, bottom };
}

function cropRgba(source: RgbaImage, left: number, top: number, right: number, bottom: number): RgbaImage {
  const width = Math.max(1, source.width - left - right);
  const height = Math.max(1, source.height - top - bottom);
  assertSafePixelCount(width, height);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = ((y + top) * source.width + (x + left)) * 4;
      const dest = (y * width + x) * 4;
      data[dest] = source.data[src] ?? 0;
      data[dest + 1] = source.data[src + 1] ?? 0;
      data[dest + 2] = source.data[src + 2] ?? 0;
      data[dest + 3] = source.data[src + 3] ?? 255;
    }
  }
  return { width, height, data };
}

function padRgba(source: RgbaImage, targetWidth: number, targetHeight: number): RgbaImage {
  assertSafePixelCount(targetWidth, targetHeight);
  const data = new Uint8Array(targetWidth * targetHeight * 4);
  data.fill(255);
  const offsetX = Math.floor((targetWidth - source.width) / 2);
  const offsetY = Math.floor((targetHeight - source.height) / 2);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const destX = x + offsetX;
      const destY = y + offsetY;
      if (destX < 0 || destY < 0 || destX >= targetWidth || destY >= targetHeight) continue;
      const src = (y * source.width + x) * 4;
      const dest = (destY * targetWidth + destX) * 4;
      data[dest] = source.data[src] ?? 0;
      data[dest + 1] = source.data[src + 1] ?? 0;
      data[dest + 2] = source.data[src + 2] ?? 0;
      data[dest + 3] = source.data[src + 3] ?? 255;
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}

function restoreFaded(source: RgbaImage, strength: number): RgbaImage {
  const balanced = adjustWhiteBalance(source, Math.min(1, strength + 0.15));
  const contrasted = adjustContrast(balanced, Math.min(1, 0.45 + strength * 0.3));
  return adjustSaturation(contrasted, Math.min(1, 0.55 + strength * 0.25));
}

export function isModelBasedKind(kind: EnhancementOperationKind): boolean {
  return kind === 'scratch.restore' || kind === 'face_detail.enhance';
}

export function applyEnhancementOperation(
  source: RgbaImage,
  operation: EnhancementOperation,
): { image: RgbaImage; skipped?: string } {
  if (operation.implementationMethod === 'model_based' || isModelBasedKind(operation.kind)) {
    return { image: source, skipped: 'model_based_unavailable' };
  }
  switch (operation.kind) {
    case 'orientation.correct': {
      const degrees = Number(operation.parameters.degrees ?? 90);
      if (degrees !== 90 && degrees !== 180 && degrees !== 270) {
        throw new Error('invalid_orientation');
      }
      return { image: rotateRgba(source, degrees) };
    }
    case 'exposure.adjust':
      return { image: adjustExposure(source, operation.strength) };
    case 'white_balance.correct':
      return { image: adjustWhiteBalance(source, operation.strength) };
    case 'contrast.adjust':
      return { image: adjustContrast(source, operation.strength) };
    case 'highlights.adjust':
      return { image: adjustHighlightsShadows(source, operation.strength, 'highlights') };
    case 'shadows.adjust':
      return { image: adjustHighlightsShadows(source, operation.strength, 'shadows') };
    case 'saturation.adjust':
      return { image: adjustSaturation(source, operation.strength) };
    case 'noise.reduce':
      return { image: boxBlur(source, 1 + operation.strength) };
    case 'sharpen':
      return { image: sharpen(source, operation.strength) };
    case 'resize':
    case 'upscale': {
      const maxWidth = Number(operation.parameters.maxWidth ?? source.width);
      const maxHeight = Number(operation.parameters.maxHeight ?? source.height);
      if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth < 1 || maxHeight < 1) {
        throw new Error('invalid_target_dimensions');
      }
      if (maxWidth * maxHeight > MAX_ENHANCEMENT_TARGET_PIXELS) {
        throw new Error('excessive_target_dimensions');
      }
      const scale =
        operation.kind === 'upscale'
          ? Math.min(maxWidth / source.width, maxHeight / source.height, Number(operation.parameters.scale ?? 2))
          : Math.min(maxWidth / source.width, maxHeight / source.height, 1);
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      return { image: resizeRgba(source, width, height) };
    }
    case 'border.remove': {
      const border = detectBorder(source);
      if (!border) {
        return { image: source, skipped: 'no_border_detected' };
      }
      return { image: cropRgba(source, border.left, border.top, border.right, border.bottom) };
    }
    case 'crop': {
      const left = Number(operation.parameters.left ?? 0);
      const top = Number(operation.parameters.top ?? 0);
      const right = Number(operation.parameters.right ?? 0);
      const bottom = Number(operation.parameters.bottom ?? 0);
      if ([left, top, right, bottom].some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error('invalid_crop');
      }
      return { image: cropRgba(source, left, top, right, bottom) };
    }
    case 'pad': {
      const targetWidth = Number(operation.parameters.targetWidth ?? source.width);
      const targetHeight = Number(operation.parameters.targetHeight ?? source.height);
      if (targetWidth * targetHeight > MAX_ENHANCEMENT_TARGET_PIXELS) {
        throw new Error('excessive_target_dimensions');
      }
      return { image: padRgba(source, targetWidth, targetHeight) };
    }
    case 'faded_photo.restore':
      return { image: restoreFaded(source, operation.strength) };
    case 'scratch.restore':
    case 'face_detail.enhance':
      return { image: source, skipped: 'model_based_unavailable' };
    default: {
      const unknown: EnhancementOperationKind = operation.kind;
      if (!(ENHANCEMENT_OPERATION_KINDS as readonly string[]).includes(unknown)) {
        throw new Error('unsupported_operation');
      }
      throw new Error('unsupported_operation');
    }
  }
}

export function applyEnhancementPipeline(
  source: RgbaImage,
  operations: readonly EnhancementOperation[],
): { image: RgbaImage; applied: EnhancementOperation[]; skipped: string[] } {
  let image = cloneImage(source);
  const applied: EnhancementOperation[] = [];
  const skipped: string[] = [];
  for (const operation of operations) {
    if (operation.strength < 0 || operation.strength > 1) {
      throw new Error('invalid_strength');
    }
    const result = applyEnhancementOperation(image, operation);
    if (result.skipped) {
      skipped.push(`${operation.kind}:${result.skipped}`);
      continue;
    }
    image = result.image;
    applied.push(operation);
  }
  return { image, applied, skipped };
}

export function validateEnhancedOutput(input: {
  bytes: Uint8Array;
  expectedWidth?: number;
  expectedHeight?: number;
}): EnhancementTechnicalReport {
  const mime = sniffMime(input.bytes);
  const warnings: string[] = [];
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    return enhancementTechnicalReportSchema.parse({
      decodeOk: false,
      mime: mime ?? 'unknown',
      sizeBytes: input.bytes.byteLength,
      blankOrBlack: false,
      extremeClipping: false,
      invalidCrop: false,
      renderCompatible: false,
      warnings: ['unsupported_mime'],
    });
  }
  if (input.bytes.byteLength > MAX_ENHANCEMENT_OUTPUT_BYTES) {
    warnings.push('oversized_output');
  }
  let width: number | undefined;
  let height: number | undefined;
  let blankOrBlack = false;
  let extremeClipping = false;
  try {
    const decoded = decodeRaster(input.bytes);
    width = decoded.width;
    height = decoded.height;
    if (input.expectedWidth && input.expectedWidth !== width) {
      warnings.push('dimension_mismatch');
    }
    if (input.expectedHeight && input.expectedHeight !== height) {
      warnings.push('dimension_mismatch');
    }
    let dark = 0;
    let clipped = 0;
    const sampleStep = Math.max(1, Math.floor((decoded.width * decoded.height) / 4000));
    for (let index = 0; index < decoded.width * decoded.height; index += sampleStep) {
      const offset = index * 4;
      const r = decoded.data[offset] ?? 0;
      const g = decoded.data[offset + 1] ?? 0;
      const b = decoded.data[offset + 2] ?? 0;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 8) dark += 1;
      if (luma <= 2 || luma >= 253) clipped += 1;
    }
    const samples = Math.ceil((decoded.width * decoded.height) / sampleStep);
    blankOrBlack = dark / samples > 0.98;
    extremeClipping = clipped / samples > 0.35;
  } catch {
    return enhancementTechnicalReportSchema.parse({
      decodeOk: false,
      mime,
      sizeBytes: input.bytes.byteLength,
      blankOrBlack: false,
      extremeClipping: false,
      invalidCrop: false,
      renderCompatible: false,
      warnings: ['decode_failed'],
    });
  }
  if (blankOrBlack) warnings.push('blank_or_black');
  if (extremeClipping) warnings.push('extreme_clipping');
  return enhancementTechnicalReportSchema.parse({
    decodeOk: true,
    width,
    height,
    mime,
    sizeBytes: input.bytes.byteLength,
    blankOrBlack,
    extremeClipping,
    invalidCrop: false,
    renderCompatible: !blankOrBlack,
    warnings,
  });
}

export function encodeEnhancedJpeg(image: RgbaImage, qualityMode: 'preview' | 'full'): Uint8Array {
  return encodeJpeg(image, qualityMode === 'preview' ? 78 : 88);
}

export function enhancementStorageLabel(variantPublicId: string): string {
  return `enhanced-${variantPublicId}`;
}
