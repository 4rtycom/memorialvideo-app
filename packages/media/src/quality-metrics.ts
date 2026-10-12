import { resizeRgba, type RgbaImage } from './pixels';
import type { QualityObservation } from '@memorialvideo/contracts';

export function meanLuma(image: RgbaImage): number {
  let total = 0;
  const pixels = image.width * image.height;
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    total += 0.299 * (image.data[offset] ?? 0) + 0.587 * (image.data[offset + 1] ?? 0) + 0.114 * (image.data[offset + 2] ?? 0);
  }
  return pixels ? total / pixels : 0;
}

export function laplacianVariance(image: RgbaImage): number {
  const small = resizeRgba(image, 64, 64);
  const gray = new Float64Array(64 * 64);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] =
      0.299 * (small.data[offset] ?? 0) + 0.587 * (small.data[offset + 1] ?? 0) + 0.114 * (small.data[offset + 2] ?? 0);
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < 63; y += 1) {
    for (let x = 1; x < 63; x += 1) {
      const center = gray[y * 64 + x] ?? 0;
      const lap =
        (gray[(y - 1) * 64 + x] ?? 0) +
        (gray[(y + 1) * 64 + x] ?? 0) +
        (gray[y * 64 + x - 1] ?? 0) +
        (gray[y * 64 + x + 1] ?? 0) -
        4 * center;
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (!count) {
    return 0;
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function imageQualityObservations(input: {
  width: number;
  height: number;
  luma: number;
  sharpness: number;
}): QualityObservation[] {
  const observations: QualityObservation[] = [];
  const minEdge = Math.min(input.width, input.height);
  const aspect = input.width / input.height;
  if (minEdge < 720) {
    observations.push({
      code: 'low_resolution',
      severity: 'suggestion',
      method: 'min-edge',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (aspect > 2.4 || aspect < 1 / 2.4) {
    observations.push({
      code: 'extreme_aspect',
      severity: 'information',
      method: 'width-height-ratio',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (input.sharpness < 40) {
    observations.push({
      code: 'soft_focus',
      severity: 'suggestion',
      method: 'laplacian-variance',
      confidence: 0.7,
      reviewState: 'unreviewed',
    });
  }
  if (input.luma < 28) {
    observations.push({
      code: 'dark_exposure',
      severity: 'suggestion',
      method: 'mean-luma',
      confidence: 0.75,
      reviewState: 'unreviewed',
    });
  }
  if (input.luma > 230) {
    observations.push({
      code: 'bright_exposure',
      severity: 'suggestion',
      method: 'mean-luma',
      confidence: 0.75,
      reviewState: 'unreviewed',
    });
  }
  return observations;
}

export function videoQualityObservations(input: {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean;
  frameRate?: number | null;
}): QualityObservation[] {
  const observations: QualityObservation[] = [];
  if (input.width && input.height && Math.min(input.width, input.height) < 720) {
    observations.push({
      code: 'low_resolution',
      severity: 'suggestion',
      method: 'min-edge',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (!input.hasAudio) {
    observations.push({
      code: 'missing_audio',
      severity: 'information',
      method: 'mp4-handler',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (input.durationMs !== null && input.durationMs < 800) {
    observations.push({
      code: 'very_short',
      severity: 'information',
      method: 'mp4-duration',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (input.durationMs !== null && input.durationMs > 30_000) {
    observations.push({
      code: 'unusually_long',
      severity: 'warning',
      method: 'mp4-duration',
      confidence: 1,
      reviewState: 'unreviewed',
    });
  }
  if (input.frameRate && input.frameRate < 12) {
    observations.push({
      code: 'low_frame_rate',
      severity: 'suggestion',
      method: 'mp4-mdhd',
      confidence: 0.6,
      reviewState: 'unreviewed',
    });
  }
  return observations;
}

export function audioQualityObservations(input: {
  peak: number;
  rms: number;
}): QualityObservation[] {
  const observations: QualityObservation[] = [];
  if (input.rms < 0.01) {
    observations.push({
      code: 'near_silence',
      severity: 'information',
      method: 'pcm-rms',
      confidence: 0.8,
      reviewState: 'unreviewed',
    });
  }
  if (input.peak >= 0.99) {
    observations.push({
      code: 'clipping',
      severity: 'suggestion',
      method: 'pcm-peak',
      confidence: 0.7,
      reviewState: 'unreviewed',
    });
  }
  return observations;
}

export function similarityFromHamming(distance: number, bits = 64): number {
  return Math.max(0, 1 - distance / bits);
}
