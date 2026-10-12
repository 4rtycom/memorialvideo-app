import {
  ceremonyMusicPlanSchema,
  parseTimelineContract,
  type CeremonyMusicPlan,
  type TimelineContract,
} from '@memorialvideo/contracts';
import {
  BETA_MUSIC_CATALOG,
  catalogTrackById,
  ceremonyMusicLicenseStatuses,
  defaultCeremonyMusicPlan,
  proposeCeremonyMusicMix,
  suggestedTributeTrack,
  withCeremonyMusicOnTimeline,
} from '@memorialvideo/domain';
import { isMusicCatalogEnabled } from '@memorialvideo/config/env';
import { creatorEnv } from './env';
import { getTribute, persistCeremonyMusicApply, type Tribute } from './store';

export function previewSrcForTrack(trackId: string): string {
  return `/api/music/preview?trackId=${encodeURIComponent(trackId)}`;
}

export function planFromSoundtrack(trackId: string | null | undefined): CeremonyMusicPlan {
  return defaultCeremonyMusicPlan(trackId ?? suggestedTributeTrack().trackId);
}

export function parseStoredCeremonyMusicPlan(raw: unknown): CeremonyMusicPlan | null {
  if (!raw) return null;
  const parsed = ceremonyMusicPlanSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function trackKeysFromPlan(plan: CeremonyMusicPlan): string[] {
  return [
    plan.slots.opening.trackKey,
    plan.slots.tribute.trackKey,
    plan.slots.reflection.trackKey,
    plan.slots.closing.trackKey,
  ].filter((key): key is string => Boolean(key));
}

function resolveTracks(plan: CeremonyMusicPlan) {
  const keys = trackKeysFromPlan(plan);
  if (keys.length === 0) {
    return [...BETA_MUSIC_CATALOG];
  }
  const tracks = keys
    .map((key) => catalogTrackById(key))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (tracks.length !== keys.length) {
    throw new Error('music_track_unknown');
  }
  return tracks;
}

/** Pure: attach AudioMixContract + legacy music bed onto a TimelineContract. */
export function applyCeremonyMusicToTimeline(
  timeline: TimelineContract,
  plan: CeremonyMusicPlan,
): TimelineContract {
  const tracks = resolveTracks(plan);
  const mix = proposeCeremonyMusicMix({
    timeline,
    plan,
    tracks,
    previewSrcForTrack,
  });
  return parseTimelineContract(
    withCeremonyMusicOnTimeline({
      timeline,
      plan,
      mix,
      tracks,
      previewSrcForTrack,
    }),
  );
}

export type CeremonyMusicLoadResult =
  | { enabled: false; note: string }
  | {
      enabled: true;
      plan: CeremonyMusicPlan;
      hasTimeline: boolean;
      applied: boolean;
      soundtrackTrackId: string | null;
      musicRightsConfirmed: boolean;
      licenseStatuses: string[];
      clipCount: number;
      note: string;
    };

export async function loadCreatorCeremonyMusic(tribute: Tribute): Promise<CeremonyMusicLoadResult> {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return { enabled: false, note: 'Music catalog disabled (MUSIC_CATALOG_ENABLED=false).' };
  }
  const plan =
    parseStoredCeremonyMusicPlan(tribute.ceremonyMusicPlan) ??
    planFromSoundtrack(tribute.soundtrackTrackId);
  const tracks = resolveTracks(plan);
  const musicTrack = tribute.timeline?.audio?.tracks.find((t) => t.kind === 'music');
  return {
    enabled: true,
    plan,
    hasTimeline: Boolean(tribute.timeline),
    applied: Boolean(musicTrack?.clips.length),
    soundtrackTrackId: tribute.soundtrackTrackId,
    musicRightsConfirmed: tribute.musicRightsConfirmed,
    licenseStatuses: ceremonyMusicLicenseStatuses({ plan, tracks }),
    clipCount: musicTrack?.clips.length ?? 0,
    note: 'Synthetic development_only catalog. Licensed masters remain XB-002. Voice recreation blocked (XB-009).',
  };
}

export type CeremonyMusicActionResult =
  | {
      ok: true;
      plan: CeremonyMusicPlan;
      previewTimeline?: TimelineContract;
      timeline?: TimelineContract;
      timelineVersion?: number;
      clipCount: number;
      licenseStatuses: string[];
    }
  | { ok: false; error: string; status: number };

export async function previewCreatorCeremonyMusic(
  publicId: string,
  plan: CeremonyMusicPlan,
): Promise<CeremonyMusicActionResult> {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return { ok: false, error: 'disabled', status: 404 };
  }
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timeline) {
    return { ok: false, error: 'needs_timeline', status: 409 };
  }
  try {
    const next = applyCeremonyMusicToTimeline(tribute.timeline, plan);
    const clipCount = next.audio?.tracks.find((t) => t.kind === 'music')?.clips.length ?? 0;
    return {
      ok: true,
      plan,
      previewTimeline: next,
      clipCount,
      licenseStatuses: ceremonyMusicLicenseStatuses({ plan, tracks: resolveTracks(plan) }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'preview_failed';
    return { ok: false, error: message, status: 400 };
  }
}

export async function applyCreatorCeremonyMusic(
  publicId: string,
  plan: CeremonyMusicPlan,
): Promise<CeremonyMusicActionResult> {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return { ok: false, error: 'disabled', status: 404 };
  }
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  if (!tribute.timeline) {
    return { ok: false, error: 'needs_timeline', status: 409 };
  }
  if (!plan.slots.tribute.trackKey) {
    return { ok: false, error: 'music_plan_empty', status: 400 };
  }

  let nextTimeline: TimelineContract;
  try {
    nextTimeline = applyCeremonyMusicToTimeline(tribute.timeline, plan);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'apply_failed';
    return { ok: false, error: message, status: 400 };
  }

  const persisted = await persistCeremonyMusicApply({
    publicId,
    plan,
    timeline: nextTimeline,
    soundtrackTrackId: plan.slots.tribute.trackKey,
  });
  if (!persisted.ok) {
    return { ok: false, error: 'not_found', status: 404 };
  }

  const clipCount = nextTimeline.audio?.tracks.find((t) => t.kind === 'music')?.clips.length ?? 0;
  return {
    ok: true,
    plan,
    timeline: persisted.tribute.timeline ?? nextTimeline,
    timelineVersion: persisted.tribute.timelineVersion,
    clipCount,
    licenseStatuses: ceremonyMusicLicenseStatuses({ plan, tracks: resolveTracks(plan) }),
  };
}
