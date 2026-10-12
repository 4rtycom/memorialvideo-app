import {
  IMAGE_MIN_FRAMES,
  OUTPUT_VARIANT_ENGINE,
  aspectFromDimensions,
  buildOutputVariantSpec,
  dimensionsForAspect,
  parseTimelineContract,
  totalDurationFrames,
  type Crop,
  type DirectorV2Operation,
  type OutputAspect,
  type OutputVariantKind,
  type OutputVariantSpec,
  type TimelineContract,
  type TimelineScene,
} from '@memorialvideo/contracts';

import { ensureAudioMix, withAudioMix } from './audio-mix';

export type OutputVariantProposal = {
  variant: OutputVariantSpec;
  operations: DirectorV2Operation[];
  afterTimeline: TimelineContract;
  beforeAspect: OutputAspect;
  afterAspect: OutputAspect;
  cropUpdates: number;
  durationScaled: boolean;
  audioMuted: boolean;
};

export function timelineAspect(timeline: TimelineContract): OutputAspect {
  const aspect = aspectFromDimensions(timeline.width, timeline.height);
  if (!aspect) {
    throw new Error('unsupported_aspect');
  }
  return aspect;
}

export function withAspect(timeline: TimelineContract, aspect: OutputAspect): TimelineContract {
  const dims = dimensionsForAspect(aspect);
  return parseTimelineContract({
    ...timeline,
    width: dims.width,
    height: dims.height,
  });
}

/**
 * Keep family focal points; ensure every image has a crop so cover framing is stable
 * across 16:9 / 9:16 / 1:1. Originals stay immutable — crops are derived only.
 */
export function inheritCropsForAspect(
  timeline: TimelineContract,
  targetAspect: OutputAspect,
  policy: 'inherit_focal' | 'center_safe' = 'inherit_focal',
): { timeline: TimelineContract; operations: DirectorV2Operation[] } {
  const operations: DirectorV2Operation[] = [];
  const scenes = timeline.scenes.map((scene) => {
    if (scene.type !== 'image') {
      return scene;
    }
    const nextCrop = deriveInheritedCrop(scene.crop, targetAspect, policy);
    const changed =
      !scene.crop ||
      scene.crop.focalX !== nextCrop.focalX ||
      scene.crop.focalY !== nextCrop.focalY ||
      scene.crop.zoom !== nextCrop.zoom;
    if (changed) {
      operations.push({ op: 'update_crop', sceneId: scene.id, crop: nextCrop });
      return { ...scene, crop: nextCrop };
    }
    return scene;
  });
  return {
    timeline: parseTimelineContract({ ...timeline, scenes }),
    operations,
  };
}

function deriveInheritedCrop(
  existing: Crop | undefined,
  targetAspect: OutputAspect,
  policy: 'inherit_focal' | 'center_safe',
): Crop {
  const focalX = policy === 'center_safe' ? 0.5 : (existing?.focalX ?? 0.5);
  const focalY = policy === 'center_safe' ? 0.5 : (existing?.focalY ?? 0.5);
  let zoom = existing?.zoom ?? 1;
  // Slight extra zoom on taller/square frames keeps subject inside safe area without new face detection.
  if (targetAspect === '9:16' && zoom < 1.08) {
    zoom = Math.min(3, Math.max(zoom, 1.08));
  } else if (targetAspect === '1:1' && zoom < 1.04) {
    zoom = Math.min(3, Math.max(zoom, 1.04));
  }
  return { focalX, focalY, zoom };
}

/** Scale image/video memory durations so the film fits under a duration cap. */
export function scaleTimelineToDurationCap(
  timeline: TimelineContract,
  capFrames: number,
): { timeline: TimelineContract; operations: DirectorV2Operation[]; scaled: boolean } {
  const total = totalDurationFrames(timeline);
  if (total <= capFrames) {
    return { timeline, operations: [], scaled: false };
  }
  const fixedTypes = new Set(['intro', 'outro', 'chapter', 'quote']);
  let fixed = 0;
  let flexible = 0;
  for (const scene of timeline.scenes) {
    if (fixedTypes.has(scene.type)) {
      fixed += scene.durationFrames;
    } else {
      flexible += scene.durationFrames;
    }
  }
  const targetFlexible = Math.max(IMAGE_MIN_FRAMES, capFrames - fixed);
  const ratio = flexible > 0 ? targetFlexible / flexible : 1;
  const operations: DirectorV2Operation[] = [];
  const scenes = timeline.scenes.map((scene) => {
    if (fixedTypes.has(scene.type)) {
      return scene;
    }
    const nextDuration = Math.max(
      scene.type === 'image' ? IMAGE_MIN_FRAMES : 30,
      Math.round(scene.durationFrames * ratio),
    );
    if (nextDuration !== scene.durationFrames) {
      operations.push({
        op: 'update_duration',
        sceneId: scene.id,
        durationFrames: nextDuration,
      });
      return { ...scene, durationFrames: nextDuration };
    }
    return scene;
  });
  return {
    timeline: parseTimelineContract({ ...timeline, scenes }),
    operations,
    scaled: operations.length > 0,
  };
}

export function muteTimelineAudio(timeline: TimelineContract): {
  timeline: TimelineContract;
  operations: DirectorV2Operation[];
  muted: boolean;
} {
  if (!timeline.audio) {
    return { timeline, operations: [], muted: false };
  }
  const mix = ensureAudioMix(timeline);
  const mutedTracks = mix.tracks.map((track) => ({ ...track, muted: true }));
  const nextMix = {
    ...mix,
    tracks: mutedTracks,
    revision: mix.revision + 1,
  };
  // Prefer attachable burn-in captions when present for silent display.
  const withCaptions = {
    ...nextMix,
    subtitles: nextMix.subtitles.map((track) => ({
      ...track,
      attached: true,
      burnIn: true,
    })),
  };
  const operations: DirectorV2Operation[] = [{ op: 'audio.mix_replace', audio: withCaptions }];
  return {
    timeline: withAudioMix(timeline, withCaptions),
    operations,
    muted: true,
  };
}

/**
 * Propose an inherited output variant from the canonical timeline.
 * Preview applies ops on a copy; Apply mutates the one project timeline via TimelinePatch.
 */
export function proposeOutputVariant(input: {
  timeline: TimelineContract;
  kind: OutputVariantKind;
  aspect?: OutputAspect;
  variantId?: string;
  durationCapFrames?: number;
  silent?: boolean;
  captionsPreferred?: boolean;
  cropPolicy?: OutputVariantSpec['cropPolicy'];
  baseTimelineHash: string;
}): OutputVariantProposal {
  const beforeAspect = timelineAspect(input.timeline);
  const variant = buildOutputVariantSpec({
    id: input.variantId ?? `ov_${input.kind}_${Date.now().toString(36)}`.slice(0, 80),
    kind: input.kind,
    aspect: input.aspect,
    durationCapFrames: input.durationCapFrames,
    silent: input.silent,
    captionsPreferred: input.captionsPreferred,
    cropPolicy: input.cropPolicy,
    baseTimelineHash: input.baseTimelineHash,
  });

  const operations: DirectorV2Operation[] = [];
  let working = input.timeline;

  if (variant.aspect !== beforeAspect) {
    operations.push({ op: 'set_aspect', aspect: variant.aspect });
    working = withAspect(working, variant.aspect);
  }

  const crops = inheritCropsForAspect(working, variant.aspect, variant.cropPolicy);
  operations.push(...crops.operations);
  working = crops.timeline;

  let durationScaled = false;
  if (variant.durationCapFrames) {
    const scaled = scaleTimelineToDurationCap(working, variant.durationCapFrames);
    operations.push(...scaled.operations);
    working = scaled.timeline;
    durationScaled = scaled.scaled;
  }

  let audioMuted = false;
  if (variant.silent) {
    const muted = muteTimelineAudio(working);
    operations.push(...muted.operations);
    working = muted.timeline;
    audioMuted = muted.muted;
  } else if (variant.captionsPreferred && working.audio?.subtitles.length) {
    const mix = ensureAudioMix(working);
    const attached = {
      ...mix,
      subtitles: mix.subtitles.map((track) => ({ ...track, attached: true, burnIn: true })),
      revision: mix.revision + 1,
    };
    operations.push({ op: 'audio.mix_replace', audio: attached });
    working = withAudioMix(working, attached);
  }

  if (operations.length === 0) {
    // No-op still records a valid set_aspect to current aspect for revision provenance.
    operations.push({ op: 'set_aspect', aspect: variant.aspect });
    working = withAspect(working, variant.aspect);
  }

  return {
    variant: {
      ...variant,
      provenance: {
        provider: OUTPUT_VARIANT_ENGINE.name,
        model: 'aspect-parity',
        version: OUTPUT_VARIANT_ENGINE.version,
      },
    },
    operations,
    afterTimeline: parseTimelineContract(working),
    beforeAspect,
    afterAspect: variant.aspect,
    cropUpdates: crops.operations.length,
    durationScaled,
    audioMuted,
  };
}

export function sceneIdsTouchedByVariantOps(operations: readonly DirectorV2Operation[]): string[] {
  const ids = new Set<string>();
  for (const operation of operations) {
    if ('sceneId' in operation && typeof operation.sceneId === 'string') {
      ids.add(operation.sceneId);
    }
  }
  return [...ids];
}

export function countImageScenes(timeline: TimelineContract): number {
  return timeline.scenes.filter((scene: TimelineScene) => scene.type === 'image').length;
}
