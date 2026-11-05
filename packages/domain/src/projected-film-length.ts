import type { MusicDirectorPlan, MusicSongReference } from '@memorialvideo/contracts';

import { catalogTrackById, type CatalogTrackMeta } from './music-catalog';

/**
 * Assumed length for a cherished song when duration is unknown (3m30s).
 * Three such songs (~10m30s) correctly step Memorial Tribute → Life Story.
 */
export const DEFAULT_CHERISHED_SONG_DURATION_MS = 3 * 60_000 + 30_000;

export type ResolvedSongDuration = {
  durationMs: number;
  /** True when DEFAULT_CHERISHED_SONG_DURATION_MS was used. */
  estimated: boolean;
};

export type ProjectedFilmLength = {
  visualDurationSeconds: number;
  musicDurationSeconds: number;
  /** max(visual, music) — film must fit photos and full songs. */
  projectedDurationSeconds: number;
  songCount: number;
  usedSongDurationEstimate: boolean;
  drivingSource: 'visual' | 'music' | 'equal' | 'none';
};

export function resolveCherishedSongDurationMs(input: {
  song?: Pick<MusicSongReference, 'durationMs' | 'catalogTrackKey'> | null;
  durationMs?: number | null;
  catalogTrackKey?: string | null;
  catalog?: CatalogTrackMeta | null;
}): ResolvedSongDuration {
  const explicit =
    typeof input.durationMs === 'number'
      ? input.durationMs
      : typeof input.song?.durationMs === 'number'
        ? input.song.durationMs
        : null;
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return { durationMs: Math.round(explicit), estimated: false };
  }

  const catalogKey = input.catalogTrackKey ?? input.song?.catalogTrackKey ?? null;
  const catalog =
    input.catalog ?? (catalogKey ? catalogTrackById(catalogKey) : undefined);
  if (catalog && catalog.durationMs > 0) {
    return { durationMs: catalog.durationMs, estimated: false };
  }

  return { durationMs: DEFAULT_CHERISHED_SONG_DURATION_MS, estimated: true };
}

/**
 * Sum of full song lengths for non-empty Music Director slots.
 * Venue-noted and identified songs still count — families choose three favourites
 * for the ceremony; pack length must not assume silent shortening.
 */
export function musicIntentDurationSeconds(
  plan: MusicDirectorPlan | null | undefined,
): { seconds: number; songCount: number; usedEstimate: boolean } {
  if (!plan?.slots?.length) {
    return { seconds: 0, songCount: 0, usedEstimate: false };
  }

  let ms = 0;
  let songCount = 0;
  let usedEstimate = false;

  for (const slot of plan.slots) {
    if (slot.sourceState === 'empty') {
      continue;
    }
    const resolved = resolveCherishedSongDurationMs({ song: slot.song });
    ms += resolved.durationMs;
    songCount += 1;
    if (resolved.estimated) {
      usedEstimate = true;
    }
  }

  return { seconds: ms / 1000, songCount, usedEstimate };
}

/**
 * Projected film length before purchase: the greater of visual timeline length
 * and the sum of full favourite-song lengths.
 */
export function projectFilmDurationSeconds(input: {
  visualDurationSeconds: number;
  musicDirectorPlan?: MusicDirectorPlan | null;
}): ProjectedFilmLength {
  const visualDurationSeconds = Number.isFinite(input.visualDurationSeconds)
    ? Math.max(0, input.visualDurationSeconds)
    : 0;
  const music = musicIntentDurationSeconds(input.musicDirectorPlan);
  const projectedDurationSeconds = Math.max(visualDurationSeconds, music.seconds);

  let drivingSource: ProjectedFilmLength['drivingSource'] = 'none';
  if (projectedDurationSeconds <= 0) {
    drivingSource = 'none';
  } else if (music.seconds > visualDurationSeconds) {
    drivingSource = 'music';
  } else if (visualDurationSeconds > music.seconds) {
    drivingSource = 'visual';
  } else {
    drivingSource = music.songCount > 0 ? 'equal' : 'visual';
  }

  return {
    visualDurationSeconds,
    musicDurationSeconds: music.seconds,
    projectedDurationSeconds,
    songCount: music.songCount,
    usedSongDurationEstimate: music.usedEstimate,
    drivingSource,
  };
}
