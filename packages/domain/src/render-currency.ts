import { createHash } from 'node:crypto';

import type { TimelineContract } from '@memorialvideo/contracts';

/**
 * Content fingerprint for Prompt 17 stale-final detection.
 * Ignores watermark/seed so preview vs final and publish reconstruction stay comparable.
 */
export function filmContentFingerprint(timeline: TimelineContract): string {
  const payload = {
    themeKey: timeline.themeKey,
    width: timeline.width,
    height: timeline.height,
    displayName: timeline.displayName,
    locale: timeline.locale,
    scenes: timeline.scenes,
    music: timeline.music ?? null,
    audio: timeline.audio ?? null,
    styleManifestVersion: timeline.styleManifestVersion ?? 1,
  };
  return createHash('sha256').update(stableJson(payload)).digest('hex');
}

/**
 * A READY final must not masquerade as current after the published film changes.
 */
export function isRenderCurrentForPublishedTimeline(input: {
  publishedTimeline: TimelineContract | null | undefined;
  renderTimeline: TimelineContract | null | undefined;
}): boolean {
  if (!input.publishedTimeline || !input.renderTimeline) {
    return false;
  }
  return filmContentFingerprint(input.publishedTimeline) === filmContentFingerprint(input.renderTimeline);
}

export function formatOutputAspect(width: number, height: number): '16:9' | '9:16' | '1:1' | 'other' {
  if (width === 1920 && height === 1080) {
    return '16:9';
  }
  if (width === 1080 && height === 1920) {
    return '9:16';
  }
  if (width === 1080 && height === 1080) {
    return '1:1';
  }
  return 'other';
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
