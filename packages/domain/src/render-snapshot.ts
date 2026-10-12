import { createHash } from 'node:crypto';

import {
  parseTimelineContract,
  type RenderKind,
  type TimelineContract,
} from '@memorialvideo/contracts';

import { canAttachCatalogTrack } from './music';
import { canAttachMusicTrack } from './audio-mix';
import { isReadyAsset, type AssetStatus } from './ingest';
import { isFinishDerivedSrc } from './memorial-finish';

export const RENDER_SPEC_VERSION = 1 as const;
export const RENDERER_VERSION = 'remotion-4.0.518';

export type SnapshotAsset = {
  assetId: string;
  projectId: string;
  status: AssetStatus;
  sha256: string | null;
  storageKey: string;
  variantKey?: string | null;
};

export type MusicLicenseSnapshot = {
  trackId: string;
  licensedForDownload: boolean;
  licensedForPrivateStream: boolean;
  userUploaded: boolean;
  featureUserUploads: boolean;
};

export type RenderSpec = {
  schemaVersion: typeof RENDER_SPEC_VERSION;
  kind: RenderKind;
  locale: TimelineContract['locale'];
  fps: TimelineContract['fps'];
  width: TimelineContract['width'];
  height: TimelineContract['height'];
  themeKey: TimelineContract['themeKey'];
  themeBuildSha: string;
  rendererVersion: string;
  watermark: boolean;
  seed: number;
  music: MusicLicenseSnapshot | null;
  /** Provenance for inherited output variant renders; optional for legacy snapshots. */
  outputVariantId?: string | null;
  outputVariantKind?: string | null;
  timeline: TimelineContract;
  assetManifest: ReadonlyArray<{
    assetId: string;
    sha256: string;
    storageKey: string;
    variantKey: string | null;
  }>;
};

export type SnapshotDenial =
  | 'invalid_timeline'
  | 'unready_asset'
  | 'missing_checksum'
  | 'foreign_asset'
  | 'watermark_mismatch'
  | 'music_rights'
  | 'missing_theme_build';

export type SnapshotBuild =
  | { ok: true; spec: RenderSpec; snapshotHash: string }
  | { ok: false; error: SnapshotDenial };

export function hashRenderSpec(spec: RenderSpec): string {
  return createHash('sha256').update(canonicalJson(spec)).digest('hex');
}

export function buildRenderSnapshot(input: {
  kind: RenderKind;
  timeline: unknown;
  assets: readonly SnapshotAsset[];
  projectId: string;
  themeBuildSha: string;
  music?: MusicLicenseSnapshot | null;
  outputVariantId?: string | null;
  outputVariantKind?: string | null;
}): SnapshotBuild {
  let timeline: TimelineContract;
  try {
    timeline = parseTimelineContract(input.timeline);
  } catch {
    return { ok: false, error: 'invalid_timeline' };
  }
  if (!input.themeBuildSha.trim()) {
    return { ok: false, error: 'missing_theme_build' };
  }
  if (input.kind === 'preview' && !timeline.watermark) {
    return { ok: false, error: 'watermark_mismatch' };
  }
  if (input.kind === 'final' && timeline.watermark) {
    return { ok: false, error: 'watermark_mismatch' };
  }
  if (input.music && !canAttachCatalogTrack(input.music)) {
    return { ok: false, error: 'music_rights' };
  }
  if (timeline.audio) {
    for (const track of timeline.audio.tracks) {
      if (track.kind !== 'music') {
        continue;
      }
      if (
        !canAttachMusicTrack({
          licensedForDownload: track.licensed,
          licensedForPrivateStream: track.licensed,
          userUploaded: track.rights?.source !== 'catalog_licensed',
          featureUserUploads: track.rights?.commercialUploadAllowed === true,
          rights: track.rights,
        })
      ) {
        return { ok: false, error: 'music_rights' };
      }
    }
  }
  const byId = new Map(input.assets.map((asset) => [asset.assetId, asset]));
  const manifest: Array<{
    assetId: string;
    sha256: string;
    storageKey: string;
    variantKey: string | null;
  }> = [];
  const lockedScenes: TimelineContract['scenes'] = [];
  for (const scene of timeline.scenes) {
    if (scene.type !== 'image' && scene.type !== 'video') {
      lockedScenes.push(scene);
      continue;
    }
    const asset = byId.get(scene.asset.assetId);
    if (!asset || !isReadyAsset(asset.status)) {
      return { ok: false, error: 'unready_asset' };
    }
    if (asset.projectId !== input.projectId) {
      return { ok: false, error: 'foreign_asset' };
    }
    if (!asset.sha256) {
      return { ok: false, error: 'missing_checksum' };
    }
    manifest.push({
      assetId: asset.assetId,
      sha256: asset.sha256,
      storageKey: asset.storageKey,
      variantKey: asset.variantKey ?? null,
    });
    const finishSrc =
      typeof scene.asset.finishJobId === 'string' &&
      scene.asset.finishJobId.length > 0 &&
      typeof scene.asset.src === 'string' &&
      isFinishDerivedSrc(scene.asset.src)
        ? scene.asset.src
        : null;
    const enhancementSrc =
      typeof scene.asset.enhancementVariantId === 'string' &&
      scene.asset.enhancementVariantId.length > 0 &&
      typeof scene.asset.src === 'string' &&
      scene.asset.src.startsWith('storage://project-variants/') &&
      !isFinishDerivedSrc(scene.asset.src)
        ? scene.asset.src
        : null;
    const mediaSrc =
      finishSrc ??
      enhancementSrc ??
      (asset.variantKey
        ? `storage://project-variants/${asset.variantKey}`
        : `storage://project-originals/${asset.storageKey}`);
    lockedScenes.push({
      ...scene,
      asset: {
        ...scene.asset,
        src: mediaSrc,
        checksum: asset.sha256,
      },
    });
  }
  const spec: RenderSpec = {
    schemaVersion: RENDER_SPEC_VERSION,
    kind: input.kind,
    locale: timeline.locale,
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    themeKey: timeline.themeKey,
    themeBuildSha: input.themeBuildSha,
    rendererVersion: RENDERER_VERSION,
    watermark: timeline.watermark,
    seed: timeline.seed,
    music: input.music ?? null,
    outputVariantId: input.outputVariantId ?? null,
    outputVariantKind: input.outputVariantKind ?? null,
    timeline: {
      ...timeline,
      scenes: lockedScenes,
    },
    assetManifest: manifest,
  };
  return { ok: true, spec, snapshotHash: hashRenderSpec(spec) };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
