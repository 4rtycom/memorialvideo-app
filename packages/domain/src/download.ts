import type { RenderKind } from '@memorialvideo/contracts';

export const DOWNLOAD_TTL_SECONDS = 15 * 60;
export const PLAYBACK_TTL_SECONDS = 2 * 60 * 60;

export function canIssueSignedDownload(input: {
  kind: RenderKind;
  jobReady: boolean;
  outputVerified: boolean;
  deleted: boolean;
  allowsPrivatePlayback: boolean;
}): boolean {
  if (input.deleted || !input.jobReady || !input.outputVerified) {
    return false;
  }
  if (input.kind === 'preview') {
    return true;
  }
  // Finals/fallbacks require Memorial Pack private playback — never invent download rights.
  return input.allowsPrivatePlayback === true;
}

export function signedUrlTtl(kind: RenderKind): number {
  return kind === 'preview' ? DOWNLOAD_TTL_SECONDS : PLAYBACK_TTL_SECONDS;
}

export type ByteRangePlan =
  | { action: 'full' }
  | { action: 'partial'; start: number; end: number }
  | { action: 'unsatisfiable' };

export function planByteRange(input: { sizeBytes: number; rangeHeader?: string | null }): ByteRangePlan {
  if (!input.rangeHeader || input.sizeBytes <= 0) {
    return { action: 'full' };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(input.rangeHeader.trim());
  if (!match) {
    return { action: 'unsatisfiable' };
  }
  const start = match[1] ? Number(match[1]) : input.sizeBytes - Number(match[2] || 0);
  const end = match[2] ? Number(match[2]) : input.sizeBytes - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= input.sizeBytes) {
    return { action: 'unsatisfiable' };
  }
  return { action: 'partial', start, end: Math.min(end, input.sizeBytes - 1) };
}
