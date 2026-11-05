import {
  musicDirectorPlanSchema,
  parseMusicDirectorPlan,
  type MusicDirectorPlan,
} from '@memorialvideo/contracts';
import {
  ceremonyPlanToMusicDirector,
  defaultMusicDirectorPlan,
  musicDirectorApplyTrackKey,
  musicDirectorHasPlayableAudio,
  musicDirectorToCeremonyPlan,
  withInferredSourceStates,
} from '@memorialvideo/domain';
import { isMusicCatalogEnabled } from '@memorialvideo/config/env';
import {
  applyCreatorCeremonyMusic,
  loadCreatorCeremonyMusic,
  parseStoredCeremonyMusicPlan,
  planFromSoundtrack,
} from './ceremony-music-local';
import { creatorEnv } from './env';
import { getTribute, updateTribute, type Tribute } from './store';

export function parseStoredMusicDirectorPlan(raw: unknown): MusicDirectorPlan | null {
  if (!raw) return null;
  const parsed = musicDirectorPlanSchema.safeParse(raw);
  return parsed.success ? withInferredSourceStates(parsed.data) : null;
}

export function resolveMusicDirectorPlan(tribute: Tribute): MusicDirectorPlan {
  const stored = parseStoredMusicDirectorPlan(tribute.musicDirectorPlan);
  if (stored) {
    return withInferredSourceStates(
      parseMusicDirectorPlan({
        ...stored,
        rightsConfirmed: tribute.musicRightsConfirmed || stored.rightsConfirmed,
      }),
    );
  }
  return ceremonyPlanToMusicDirector({
    plan:
      parseStoredCeremonyMusicPlan(tribute.ceremonyMusicPlan) ??
      (tribute.soundtrackTrackId ? planFromSoundtrack(tribute.soundtrackTrackId) : null),
    soundtrackTrackId: tribute.soundtrackTrackId,
    rightsConfirmed: tribute.musicRightsConfirmed,
  });
}

export async function loadCreatorMusicDirector(tribute: Tribute) {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return {
      enabled: false as const,
      note: 'Music catalog disabled (MUSIC_CATALOG_ENABLED=false).',
    };
  }
  const plan = resolveMusicDirectorPlan(tribute);
  const ceremony = await loadCreatorCeremonyMusic(tribute);
  return {
    enabled: true as const,
    plan,
    hasTimeline: Boolean(tribute.timeline),
    applied: ceremony.enabled ? ceremony.applied : false,
    clipCount: ceremony.enabled ? ceremony.clipCount : 0,
    hasPlayableAudio: musicDirectorHasPlayableAudio(plan),
    openingTitle: tribute.openingTitle,
    displayName: tribute.displayName,
    note: 'Choose three favourite songs. Links are saved as references — we never pull streaming audio automatically.',
  };
}

export async function saveCreatorMusicDirector(
  publicId: string,
  planInput: unknown,
): Promise<
  | { ok: true; plan: MusicDirectorPlan }
  | { ok: false; error: string; status: number }
> {
  const parsed = musicDirectorPlanSchema.safeParse(planInput);
  if (!parsed.success) {
    return { ok: false, error: 'bad_request', status: 400 };
  }
  const plan = withInferredSourceStates(
    parseMusicDirectorPlan({
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    }),
  );
  const ceremonyPlan = musicDirectorToCeremonyPlan(plan);
  const soundtrackTrackId = musicDirectorApplyTrackKey(plan);
  const updated = await updateTribute(publicId, {
    musicDirectorPlan: plan,
    ceremonyMusicPlan: ceremonyPlan,
    soundtrackTrackId,
    musicRightsConfirmed: plan.rightsConfirmed,
  });
  if (!updated) {
    return { ok: false, error: 'not_found', status: 404 };
  }
  return { ok: true, plan: resolveMusicDirectorPlan(updated) };
}

export async function applyCreatorMusicDirector(
  publicId: string,
  planInput: unknown,
): Promise<
  | {
      ok: true;
      plan: MusicDirectorPlan;
      clipCount: number;
      applied: boolean;
      message: string;
    }
  | { ok: false; error: string; status: number }
> {
  const saved = await saveCreatorMusicDirector(publicId, planInput);
  if (!saved.ok) {
    return saved;
  }
  const plan = saved.plan;
  if (!plan.rightsConfirmed) {
    return { ok: false, error: 'music_rights', status: 400 };
  }
  if (!musicDirectorHasPlayableAudio(plan)) {
    // Persist references / venue choices without claiming film audio.
    return {
      ok: true,
      plan,
      clipCount: 0,
      applied: false,
      message:
        'Songs saved. None have in-app audio yet — the venue can play noted songs, or pick a catalog preview track.',
    };
  }

  const ceremonyPlan = musicDirectorToCeremonyPlan(plan);
  const result = await applyCreatorCeremonyMusic(publicId, ceremonyPlan);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  // Re-attach Music Director plan after ceremony apply (persistCeremonyMusicApply may omit it).
  const tribute = await getTribute(publicId);
  if (tribute) {
    await updateTribute(publicId, {
      musicDirectorPlan: plan,
      musicRightsConfirmed: true,
    });
  }

  return {
    ok: true,
    plan,
    clipCount: result.clipCount,
    applied: true,
    message:
      result.clipCount > 0
        ? `Music added to your film · ${result.clipCount} song section${result.clipCount === 1 ? '' : 's'}.`
        : 'Music settings saved.',
  };
}

export function emptyDirectorFallback(): MusicDirectorPlan {
  return defaultMusicDirectorPlan();
}
