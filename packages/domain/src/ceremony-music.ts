import {
  AUDIO_MIX_CONTRACT_VERSION,
  DEFAULT_FPS,
  emptyAudioMix,
  parseAudioMixContract,
  sceneStartFrames,
  totalDurationFrames,
  VIDEO_MAX_FRAMES,
  TIMELINE_MAX_FRAMES,
  type AudioMixContract,
  type AudioRightsDeclaration,
  type CeremonyMusicMoment,
  type CeremonyMusicPlan,
  type MixAudioTrack,
  type TimelineContract,
  type TimelineScene,
} from '@memorialvideo/contracts';

import type { CatalogTrackMeta } from './music-catalog';

export type MomentFrameRange = {
  startFrame: number;
  endFrame: number;
};

/** Full song length in frames — never silently clipped to a shorter moment. */
export function songDurationFrames(trackDurationMs: number, fps = DEFAULT_FPS): number {
  return Math.max(30, Math.round((trackDurationMs / 1000) * fps));
}

export type CeremonyMusicShortenRisk = {
  moment: CeremonyMusicMoment;
  trackKey: string;
  trackFrames: number;
  rangeFrames: number;
};

/**
 * Detect whether applying music would trim a song below its full length.
 * Call after expandTimelineForCeremonyMusic — any remaining risk is a hard error.
 */
export function ceremonyMusicShorteningRisks(input: {
  timeline: TimelineContract;
  plan: CeremonyMusicPlan;
  tracks: readonly CatalogTrackMeta[];
}): CeremonyMusicShortenRisk[] {
  const byKey = new Map(input.tracks.map((track) => [track.trackId, track]));
  const ranges = resolveMomentFrameRanges(input.timeline);
  const total = totalDurationFrames(input.timeline);
  const risks: CeremonyMusicShortenRisk[] = [];

  for (const slot of activeCeremonyMusicSlots(input.plan)) {
    const track = byKey.get(slot.trackKey);
    if (!track) continue;
    const range =
      input.plan.mode === 'single'
        ? { startFrame: 0, endFrame: total }
        : ranges[slot.moment];
    if (!range || range.endFrame <= range.startFrame) {
      risks.push({
        moment: slot.moment,
        trackKey: slot.trackKey,
        trackFrames: songDurationFrames(track.durationMs, input.timeline.fps),
        rangeFrames: 0,
      });
      continue;
    }
    const trackFrames = songDurationFrames(track.durationMs, input.timeline.fps);
    const rangeFrames = range.endFrame - range.startFrame;
    if (trackFrames > rangeFrames) {
      risks.push({
        moment: slot.moment,
        trackKey: slot.trackKey,
        trackFrames,
        rangeFrames,
      });
    }
  }
  return risks;
}

function musicHoldScenes(deficitFrames: number, idPrefix: string, title: string): TimelineScene[] {
  const holds: TimelineScene[] = [];
  let remaining = Math.max(0, Math.round(deficitFrames));
  let index = 0;
  while (remaining > 0) {
    const durationFrames = Math.min(VIDEO_MAX_FRAMES, remaining);
    holds.push({
      id: `${idPrefix}_${index + 1}`,
      type: 'chapter',
      title,
      durationFrames,
      transitionIn: 'fade',
      transitionOut: 'fade',
    });
    remaining -= durationFrames;
    index += 1;
  }
  return holds;
}

/**
 * Grow moment ranges so each assigned song fits in full.
 * Inserts chapter hold scenes when a single scene cannot absorb the extra time.
 */
export function expandTimelineForCeremonyMusic(input: {
  timeline: TimelineContract;
  plan: CeremonyMusicPlan;
  tracks: readonly CatalogTrackMeta[];
}): TimelineContract {
  const byKey = new Map(input.tracks.map((track) => [track.trackId, track]));
  let scenes = [...input.timeline.scenes];
  const fps = input.timeline.fps;

  const recomputeTimeline = (): TimelineContract => ({
    ...input.timeline,
    scenes,
  });

  for (const slot of activeCeremonyMusicSlots(input.plan)) {
    const track = byKey.get(slot.trackKey);
    if (!track) continue;
    const needed = songDurationFrames(track.durationMs, fps);
    const timeline = recomputeTimeline();
    const total = totalDurationFrames(timeline);
    if (total + needed > TIMELINE_MAX_FRAMES && total < needed) {
      // Soft guard — shorteningRisks will catch impossible fits.
    }
    const ranges = resolveMomentFrameRanges(timeline);
    const range =
      input.plan.mode === 'single'
        ? { startFrame: 0, endFrame: total }
        : ranges[slot.moment];
    if (!range) continue;
    const span = range.endFrame - range.startFrame;
    if (span >= needed) continue;
    const deficit = needed - span;
    if (deficit <= 0) continue;

    const starts = sceneStartFrames(timeline);
    // Insert holds just before the first scene that starts at/after range.endFrame,
    // or append when the range reaches the end.
    let insertAt = scenes.length;
    for (let i = 0; i < scenes.length; i += 1) {
      const start = starts[i] ?? 0;
      if (start >= range.endFrame) {
        insertAt = i;
        break;
      }
    }

    // Prefer growing a stretchable scene that ends at range.endFrame (intro/outro/chapter/quote/video).
    const lastInRangeIdx = insertAt - 1;
    if (lastInRangeIdx >= 0) {
      const last = scenes[lastInRangeIdx]!;
      if (last.type !== 'image') {
        const room = VIDEO_MAX_FRAMES - last.durationFrames;
        if (room > 0) {
          const grow = Math.min(room, deficit);
          scenes = scenes.map((scene, index) =>
            index === lastInRangeIdx
              ? { ...scene, durationFrames: scene.durationFrames + grow }
              : scene,
          );
          const stillNeeded = deficit - grow;
          if (stillNeeded > 0) {
            const holds = musicHoldScenes(
              stillNeeded,
              `music_hold_${slot.moment}`,
              slot.moment === 'opening'
                ? 'Opening continues'
                : slot.moment === 'closing'
                  ? 'Farewell continues'
                  : 'Memories continue',
            );
            scenes = [...scenes.slice(0, insertAt), ...holds, ...scenes.slice(insertAt)];
          }
          continue;
        }
      }
    }

    const holds = musicHoldScenes(
      deficit,
      `music_hold_${slot.moment}`,
      slot.moment === 'opening'
        ? 'Opening continues'
        : slot.moment === 'closing'
          ? 'Farewell continues'
          : 'Memories continue',
    );
    scenes = [...scenes.slice(0, insertAt), ...holds, ...scenes.slice(insertAt)];
  }

  const next = recomputeTimeline();
  if (totalDurationFrames(next) > TIMELINE_MAX_FRAMES) {
    throw new Error('music_would_exceed_timeline_max');
  }
  return next;
}

export function defaultCeremonyMusicPlan(suggestedTributeTrackKey?: string | null): CeremonyMusicPlan {
  return {
    mode: 'single',
    slots: {
      opening: { trackKey: null, venueHandled: true },
      tribute: { trackKey: suggestedTributeTrackKey ?? null },
      reflection: { trackKey: null },
      closing: { trackKey: null },
    },
  };
}

export function resolveMomentFrameRanges(timeline: TimelineContract): Record<CeremonyMusicMoment, MomentFrameRange | null> {
  const starts = sceneStartFrames(timeline);
  const scenes = timeline.scenes;
  const total = totalDurationFrames(timeline);

  const introIdx = scenes.findIndex((scene) => scene.type === 'intro');
  const outroIdx = scenes.findIndex((scene) => scene.type === 'outro');
  const chapterIndices = scenes
    .map((scene, index) => (scene.type === 'chapter' ? index : -1))
    .filter((index) => index >= 0);

  const introStart = introIdx >= 0 ? (starts[introIdx] ?? 0) : 0;
  const introEnd = introIdx >= 0 ? introStart + (scenes[introIdx]?.durationFrames ?? 0) : 0;
  const outroStart = outroIdx >= 0 ? (starts[outroIdx] ?? total) : total;
  const outroEnd = outroIdx >= 0 ? outroStart + (scenes[outroIdx]?.durationFrames ?? 0) : total;
  const bodyStart = introEnd;
  const bodyEnd = outroStart > bodyStart ? outroStart : total;

  let reflectionRange: MomentFrameRange | null = null;
  if (chapterIndices.length > 0) {
    const lastChapterIdx = chapterIndices[chapterIndices.length - 1]!;
    reflectionRange = {
      startFrame: starts[lastChapterIdx] ?? bodyStart,
      endFrame: (starts[lastChapterIdx] ?? bodyStart) + (scenes[lastChapterIdx]?.durationFrames ?? 0),
    };
  } else if (bodyEnd > bodyStart) {
    const span = bodyEnd - bodyStart;
    reflectionRange = {
      startFrame: bodyStart + Math.floor(span * 0.75),
      endFrame: bodyEnd,
    };
  }

  return {
    opening: introIdx >= 0 ? { startFrame: introStart, endFrame: introEnd } : null,
    tribute:
      bodyEnd > bodyStart
        ? { startFrame: bodyStart, endFrame: bodyEnd }
        : { startFrame: 0, endFrame: total },
    reflection: reflectionRange,
    closing: outroIdx >= 0 ? { startFrame: outroStart, endFrame: outroEnd } : null,
  };
}

function catalogRights(track: CatalogTrackMeta, declaredAt: string): AudioRightsDeclaration {
  return {
    source: 'catalog_licensed',
    syntheticOrRightsCleared: true,
    commercialUploadAllowed: false,
    declaredAt,
    noteKey: track.licenseStatus === 'development_only' ? 'music.catalog.development_only' : 'music.catalog.licensed',
  };
}

export function activeCeremonyMusicSlots(plan: CeremonyMusicPlan): Array<{
  moment: CeremonyMusicMoment;
  trackKey: string;
}> {
  if (plan.mode === 'single') {
    const tribute = plan.slots.tribute.trackKey;
    return tribute ? [{ moment: 'tribute', trackKey: tribute }] : [];
  }
  const moments: CeremonyMusicMoment[] = ['opening', 'tribute', 'reflection', 'closing'];
  return moments.flatMap((moment) => {
    const slot = plan.slots[moment];
    if (!slot.trackKey) {
      return [];
    }
    if (moment === 'opening' && slot.venueHandled) {
      return [];
    }
    return [{ moment, trackKey: slot.trackKey }];
  });
}

/**
 * Build the AudioMix for ceremony music.
 * Songs are never silently shortened — expand the timeline first via
 * expandTimelineForCeremonyMusic (see applyCeremonyMusicToTimeline).
 */
export function proposeCeremonyMusicMix(input: {
  timeline: TimelineContract;
  plan: CeremonyMusicPlan;
  tracks: readonly CatalogTrackMeta[];
  previewSrcForTrack: (trackKey: string) => string;
  declaredAt?: string;
  /** Explicit opt-in only — family apply path must leave this false/undefined. */
  allowSongShorten?: boolean;
}): AudioMixContract {
  const declaredAt = input.declaredAt ?? new Date().toISOString();
  const byKey = new Map(input.tracks.map((track) => [track.trackId, track]));
  const ranges = resolveMomentFrameRanges(input.timeline);
  const slots = activeCeremonyMusicSlots(input.plan);
  if (slots.length === 0) {
    throw new Error('music_plan_empty');
  }

  if (!input.allowSongShorten) {
    const risks = ceremonyMusicShorteningRisks(input);
    if (risks.length > 0) {
      throw new Error('music_would_shorten_song');
    }
  }

  const clips: MixAudioTrack['clips'] = [];
  for (const [index, slot] of slots.entries()) {
    const track = byKey.get(slot.trackKey);
    if (!track) {
      throw new Error('music_track_unknown');
    }
    if (!track.licensedForPreview) {
      throw new Error('music_rights');
    }
    const range =
      input.plan.mode === 'single'
        ? { startFrame: 0, endFrame: totalDurationFrames(input.timeline) }
        : ranges[slot.moment];
    if (!range || range.endFrame <= range.startFrame) {
      continue;
    }
    const trackFrames = songDurationFrames(track.durationMs, input.timeline.fps);
    const rangeFrames = range.endFrame - range.startFrame;
    const durationFrames = input.allowSongShorten
      ? Math.min(rangeFrames, trackFrames)
      : trackFrames;
    clips.push({
      id: `clip_music_${slot.moment}_${index + 1}`,
      src: input.previewSrcForTrack(track.trackId),
      startFrame: range.startFrame,
      durationFrames,
      gainDb: -6,
      fadeInFrames: 15,
      fadeOutFrames: 30,
    });
  }
  if (clips.length === 0) {
    throw new Error('music_plan_empty');
  }

  const tributeTrack = byKey.get(planTributeTrackKey(input.plan) ?? '');
  const rights = tributeTrack ? catalogRights(tributeTrack, declaredAt) : catalogRights(input.tracks[0]!, declaredAt);

  const base = parseAudioMixContract({
    schemaVersion: AUDIO_MIX_CONTRACT_VERSION,
    revision: (input.timeline.audio?.revision ?? 0) + 1,
    masterProfile: 'ceremony_safe',
    tracks: [
      {
        id: 'trk_music',
        kind: 'music',
        muted: false,
        gainDb: -6,
        licensed: true,
        rights,
        clips,
      },
    ],
    ducking: {
      enabled: true,
      musicGainDuringSpeechDb: -14,
      attackFrames: 6,
      releaseFrames: 18,
      regions: [],
    },
    subtitles: input.timeline.audio?.subtitles ?? [],
    narrationTakes: input.timeline.audio?.narrationTakes ?? [],
    selectedNarrationTakeId: input.timeline.audio?.selectedNarrationTakeId,
    ttsProvider: input.timeline.audio?.ttsProvider ?? {
      available: false,
      status: 'blocked_xb009',
      reason: 'voice_recreation_requires_legal_review',
    },
    beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
  });

  return base;
}

export function planTributeTrackKey(plan: CeremonyMusicPlan): string | null {
  return plan.slots.tribute.trackKey;
}

export function withCeremonyMusicOnTimeline(input: {
  timeline: TimelineContract;
  plan: CeremonyMusicPlan;
  mix: AudioMixContract;
  tracks: readonly CatalogTrackMeta[];
  previewSrcForTrack: (trackKey: string) => string;
}): TimelineContract {
  const tributeKey = planTributeTrackKey(input.plan);
  const tributeTrack = tributeKey ? input.tracks.find((track) => track.trackId === tributeKey) : undefined;
  const music =
    tributeTrack && tributeKey
      ? {
          trackId: tributeKey,
          src: input.previewSrcForTrack(tributeKey),
          fadeInFrames: 30,
          fadeOutFrames: 45,
        }
      : undefined;
  return {
    ...input.timeline,
    music,
    audio: input.mix,
  };
}

export function ceremonyMusicLicenseStatuses(input: {
  plan: CeremonyMusicPlan;
  tracks: readonly CatalogTrackMeta[];
}): string[] {
  const byKey = new Map(input.tracks.map((track) => [track.trackId, track.licenseStatus]));
  return activeCeremonyMusicSlots(input.plan).flatMap((slot) => {
    const status = byKey.get(slot.trackKey);
    return status ? [status] : [];
  });
}

export function mergeCeremonyMusicMix(timeline: TimelineContract, mix: AudioMixContract | null): TimelineContract {
  if (!mix) {
    const { audio: _removed, music: _music, ...rest } = timeline;
    void _removed;
    void _music;
    return rest;
  }
  return { ...timeline, audio: mix };
}

export function ensureCeremonyMusicMix(timeline: TimelineContract): AudioMixContract {
  if (timeline.audio) {
    return parseAudioMixContract(timeline.audio);
  }
  return emptyAudioMix(0);
}
