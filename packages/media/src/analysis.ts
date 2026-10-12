import {
  ANALYSER_NAME,
  ANALYSER_VERSION,
  type AnalysisMedia,
  type MetadataCandidate,
  type QualityObservation,
} from '@memorialvideo/contracts';

import { readJpegExifCandidates } from './exif';
import { sha256Hex } from './inspect';
import { averageHash, hammingHex } from './pixels';
import {
  audioQualityObservations,
  imageQualityObservations,
  laplacianVariance,
  meanLuma,
  similarityFromHamming,
  videoQualityObservations,
} from './quality-metrics';
import { sniffMime } from './sniff';
import { decodeRasterAsync } from './variants';
import { probeMp4 } from './video-probe';
import { probeWav } from './wav-probe';

export const MEDIA_ANALYSER = {
  provider: 'local',
  model: ANALYSER_NAME,
  version: ANALYSER_VERSION,
} as const;

export const LIKELY_DUPLICATE_HAMMING = 8;
export const LIKELY_DUPLICATE_THRESHOLD = similarityFromHamming(LIKELY_DUPLICATE_HAMMING);

export type MediaInspection = {
  checksum: string;
  sizeBytes: number;
  media: AnalysisMedia;
  candidates: MetadataCandidate[];
  quality: QualityObservation[];
  perceptualHash: string | null;
  warnings: string[];
  errorCode?: string;
  partial: boolean;
  confidence: number;
};

export async function inspectStoredMedia(bytes: Uint8Array): Promise<MediaInspection> {
  const checksum = sha256Hex(bytes);
  const mime = sniffMime(bytes);
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    return inspectImage(bytes, checksum, mime);
  }
  if (mime === 'video/mp4') {
    return inspectVideo(bytes, checksum);
  }
  const wav = probeWav(bytes);
  if (wav) {
    return inspectAudio(bytes, checksum, wav);
  }
  return {
    checksum,
    sizeBytes: bytes.byteLength,
    media: { mediaKind: 'unsupported', mime: mime === 'unknown' ? undefined : mime, reason: 'unsupported_type', sizeBytes: bytes.byteLength },
    candidates: [],
    quality: [
      {
        code: 'unsupported_type',
        severity: 'information',
        method: 'magic-bytes',
        confidence: 1,
        reviewState: 'unreviewed',
      },
    ],
    perceptualHash: null,
    warnings: ['unsupported_type'],
    errorCode: undefined,
    partial: true,
    confidence: 0.4,
  };
}

async function inspectImage(
  bytes: Uint8Array,
  checksum: string,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<MediaInspection> {
  const candidates: MetadataCandidate[] = [];
  if (mime === 'image/jpeg') {
    const exif = readJpegExifCandidates(bytes);
    if (exif.capturedAt) {
      candidates.push({
        kind: 'captured_at',
        value: exif.capturedAt,
        present: true,
        source: 'exif',
        status: 'uncertain',
        method: 'exif-datetime-original',
        confidence: 0.7,
        reviewState: 'unreviewed',
      });
    }
    if (exif.timezone) {
      candidates.push({
        kind: 'timezone',
        value: exif.timezone,
        present: true,
        source: 'exif',
        status: 'uncertain',
        method: 'exif-offset-time',
        confidence: 0.5,
        reviewState: 'unreviewed',
      });
    }
    if (exif.hasLocation) {
      candidates.push({
        kind: 'location',
        present: true,
        source: 'exif',
        status: 'uncertain',
        method: 'exif-gps-ifd-present',
        confidence: 0.6,
        reviewState: 'unreviewed',
      });
    }
    try {
      const image = await decodeRasterAsync(bytes, mime);
      const quality = imageQualityObservations({
        width: image.width,
        height: image.height,
        luma: meanLuma(image),
        sharpness: laplacianVariance(image),
      });
      return {
        checksum,
        sizeBytes: bytes.byteLength,
        media: {
          mediaKind: 'photo',
          mime,
          width: image.width,
          height: image.height,
          orientation: exif.orientation,
          sizeBytes: bytes.byteLength,
        },
        candidates,
        quality,
        perceptualHash: averageHash(image),
        warnings: [],
        partial: false,
        confidence: 0.85,
      };
    } catch {
      return {
        checksum,
        sizeBytes: bytes.byteLength,
        media: { mediaKind: 'photo', mime, orientation: exif.orientation, sizeBytes: bytes.byteLength },
        candidates,
        quality: [
          {
            code: 'decode_failed',
            severity: 'blocking_technical_error',
            method: 'raster-decode',
            confidence: 1,
            reviewState: 'unreviewed',
          },
        ],
        perceptualHash: null,
        warnings: ['decode_failed'],
        errorCode: 'decode_failed',
        partial: true,
        confidence: 0.3,
      };
    }
  }
  try {
    const image = await decodeRasterAsync(bytes, mime);
    return {
      checksum,
      sizeBytes: bytes.byteLength,
      media: {
        mediaKind: 'photo',
        mime,
        width: image.width,
        height: image.height,
        sizeBytes: bytes.byteLength,
      },
      candidates,
      quality: imageQualityObservations({
        width: image.width,
        height: image.height,
        luma: meanLuma(image),
        sharpness: laplacianVariance(image),
      }),
      perceptualHash: averageHash(image),
      warnings: [],
      partial: false,
      confidence: 0.85,
    };
  } catch {
    return {
      checksum,
      sizeBytes: bytes.byteLength,
      media: { mediaKind: 'photo', mime, sizeBytes: bytes.byteLength },
      candidates,
      quality: [
        {
          code: 'decode_failed',
          severity: 'blocking_technical_error',
          method: 'raster-decode',
          confidence: 1,
          reviewState: 'unreviewed',
        },
      ],
      perceptualHash: null,
      warnings: ['decode_failed'],
      errorCode: 'decode_failed',
      partial: true,
      confidence: 0.3,
    };
  }
}

function inspectVideo(bytes: Uint8Array, checksum: string): MediaInspection {
  const probe = probeMp4(bytes);
  const quality = videoQualityObservations({
    width: probe.width,
    height: probe.height,
    durationMs: probe.durationMs,
    hasAudio: probe.hasAudio,
  });
  const warnings: string[] = [];
  if (!probe.hasVideo) {
    warnings.push('no_video_track');
  }
  return {
    checksum,
    sizeBytes: bytes.byteLength,
    media: {
      mediaKind: 'video',
      mime: 'video/mp4',
      container: 'mp4',
      codec: probe.codec ?? undefined,
      width: probe.width ?? undefined,
      height: probe.height ?? undefined,
      durationMs: probe.durationMs ?? undefined,
      hasAudio: probe.hasAudio,
      sizeBytes: bytes.byteLength,
    },
    candidates: [],
    quality,
    perceptualHash: null,
    warnings,
    partial: !probe.hasVideo || !probe.width,
    confidence: probe.hasVideo ? 0.8 : 0.4,
  };
}

function inspectAudio(
  bytes: Uint8Array,
  checksum: string,
  wav: NonNullable<ReturnType<typeof probeWav>>,
): MediaInspection {
  return {
    checksum,
    sizeBytes: bytes.byteLength,
    media: {
      mediaKind: 'audio',
      mime: 'audio/wav',
      codec: 'pcm',
      durationMs: wav.durationMs,
      channels: wav.channels,
      sampleRate: wav.sampleRate,
      sizeBytes: bytes.byteLength,
    },
    candidates: [],
    quality: audioQualityObservations({ peak: wav.peak, rms: wav.rms }),
    perceptualHash: null,
    warnings: [],
    partial: false,
    confidence: 0.75,
  };
}

export function likelyDuplicateScore(left: string, right: string): number {
  return similarityFromHamming(hammingHex(left, right));
}

export function isLikelyDuplicate(left: string, right: string): boolean {
  return hammingHex(left, right) <= LIKELY_DUPLICATE_HAMMING;
}

