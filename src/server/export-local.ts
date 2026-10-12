import { buildProjectExportManifest } from '@memorialvideo/domain';
import type { TimelineContract } from '@memorialvideo/contracts';
import { planDownloadFromJobs } from './render';
import type { Tribute } from './store';
import { buildStoreZip } from './zip-store';

const textEncoder = new TextEncoder();

/** Timeline items stripped of media srcs, captions, and filenames — metadata only. */
export function sanitizeTimelineForExport(timeline: TimelineContract | null): {
  version: number;
  items: Array<{ position: number; itemType: string; durationFrames: number }>;
  fps: number | null;
  width: number | null;
  height: number | null;
  themeKey: string | null;
  hasAudioMix: boolean;
} {
  if (!timeline) {
    return {
      version: 0,
      items: [],
      fps: null,
      width: null,
      height: null,
      themeKey: null,
      hasAudioMix: false,
    };
  }
  return {
    version: timeline.schemaVersion,
    items: timeline.scenes.map((scene, position) => ({
      position,
      itemType: scene.type,
      durationFrames: scene.durationFrames,
    })),
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    themeKey: timeline.themeKey,
    hasAudioMix: Boolean(timeline.audio),
  };
}

export type TributeExportResult =
  | { ok: true; bytes: Uint8Array; fileName: string }
  | { ok: false; error: 'no_entitlement' | 'not_found'; status: number };

/**
 * Owner metadata ZIP — Prompt 18 / GDPR project export parity with web.
 * Never includes source binaries, render outputs, tokens, or original filenames.
 */
export function exportOwnerTributeMetadata(tribute: Tribute | null): TributeExportResult {
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  const plan = planDownloadFromJobs(tribute);
  if (!plan.canExportMetadata) {
    return { ok: false, error: 'no_entitlement', status: 403 };
  }

  const manifest = buildProjectExportManifest({
    projectPublicId: tribute.publicId,
    locale: tribute.locale,
    themeKey: tribute.themeKey,
    timelineVersion: tribute.timelineVersion,
    assetCount: tribute.memories.length,
    includeMedia: false,
  });

  const timelineExport = sanitizeTimelineForExport(tribute.timeline);
  const summary = {
    schemaVersion: 1 as const,
    publicId: tribute.publicId,
    themeKey: tribute.themeKey,
    soundtrackTrackId: tribute.soundtrackTrackId,
    musicRightsConfirmed: tribute.musicRightsConfirmed,
    timelineVersion: tribute.timelineVersion,
    memoryCount: tribute.memories.length,
    readyMemoryCount: tribute.memories.filter((m) => m.ingestStatus === 'READY').length,
    storyChapterCount: tribute.storyChapters.length,
    renderJobs: tribute.renderJobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      outputVerified: job.outputVerified,
      snapshotHash: job.snapshotHash.slice(0, 16),
      timelineVersion: job.timelineVersion,
    })),
    exportedAt: new Date().toISOString(),
    note: 'Metadata-only archive. Source media and ceremony MP4 are excluded.',
  };

  const bytes = buildStoreZip([
    { name: 'manifest.json', data: textEncoder.encode(JSON.stringify(manifest, null, 2)) },
    { name: 'timeline.json', data: textEncoder.encode(JSON.stringify(timelineExport, null, 2)) },
    { name: 'summary.json', data: textEncoder.encode(JSON.stringify(summary, null, 2)) },
  ]);

  return {
    ok: true,
    bytes,
    fileName: `${tribute.publicId}-export.zip`,
  };
}
