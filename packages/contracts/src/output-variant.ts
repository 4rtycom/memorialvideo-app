import { z } from 'zod';

import { aiProvenanceSchema, INTELLIGENCE_CONTRACT_VERSION } from './intelligence';
import { OUTPUT_ASPECTS, dimensionsForAspect, type OutputAspect } from './timeline';

export const OUTPUT_VARIANT_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

/** Delivery intents derived from one canonical TimelineContract — not forked projects. */
export const OUTPUT_VARIANT_KINDS = [
  'full',
  'ceremony_short',
  'vertical',
  'square',
  'silent_captioned',
  'social_short',
] as const;
export type OutputVariantKind = (typeof OUTPUT_VARIANT_KINDS)[number];

export const OUTPUT_VARIANT_ENGINE = {
  name: 'memorialvideo-output-variant',
  version: 'v1-local',
  kind: 'deterministic' as const,
  processing: 'local' as const,
};

export const OUTPUT_VARIANT_REVISION_STATUSES = [
  'proposed',
  'previewed',
  'applied',
  'reverted',
  'superseded',
] as const;
export type OutputVariantRevisionStatus = (typeof OUTPUT_VARIANT_REVISION_STATUSES)[number];

export const OUTPUT_VARIANT_APPLY_STATUSES = ['none', 'applied', 'reverted', 'stale', 'conflict'] as const;
export type OutputVariantApplyStatus = (typeof OUTPUT_VARIANT_APPLY_STATUSES)[number];

export const OUTPUT_VARIANT_CROP_POLICIES = ['inherit_focal', 'center_safe'] as const;
export type OutputVariantCropPolicy = (typeof OUTPUT_VARIANT_CROP_POLICIES)[number];

/** Default duration caps (frames @ 30fps) for short delivery intents. */
export const VARIANT_DURATION_CAPS = {
  ceremony_short: 5 * 60 * 30,
  social_short: 60 * 30,
} as const;

export function defaultAspectForVariantKind(kind: OutputVariantKind): OutputAspect {
  if (kind === 'vertical') {
    return '9:16';
  }
  if (kind === 'square') {
    return '1:1';
  }
  return '16:9';
}

export function aspectFromDimensions(width: number, height: number): OutputAspect | null {
  if (width === 1920 && height === 1080) {
    return '16:9';
  }
  if (width === 1080 && height === 1920) {
    return '9:16';
  }
  if (width === 1080 && height === 1080) {
    return '1:1';
  }
  return null;
}

export const outputVariantSpecSchema = z.object({
  schemaVersion: z.literal(OUTPUT_VARIANT_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  kind: z.enum(OUTPUT_VARIANT_KINDS),
  aspect: z.enum(OUTPUT_ASPECTS),
  width: z.union([z.literal(1920), z.literal(1080)]),
  height: z.union([z.literal(1080), z.literal(1920)]),
  durationCapFrames: z.number().int().positive().max(30 * 60 * 30).optional(),
  silent: z.boolean().default(false),
  captionsPreferred: z.boolean().default(false),
  cropPolicy: z.enum(OUTPUT_VARIANT_CROP_POLICIES).default('inherit_focal'),
  baseTimelineHash: z.string().min(8).max(64),
  /** Same project; never a second tribute public id. */
  sameProject: z.literal(true).default(true),
  provenance: aiProvenanceSchema,
});
export type OutputVariantSpec = z.infer<typeof outputVariantSpecSchema>;

export function parseOutputVariantSpec(input: unknown): OutputVariantSpec {
  return outputVariantSpecSchema.parse(input);
}

export function buildOutputVariantSpec(input: {
  id: string;
  kind: OutputVariantKind;
  aspect?: OutputAspect;
  durationCapFrames?: number;
  silent?: boolean;
  captionsPreferred?: boolean;
  cropPolicy?: OutputVariantCropPolicy;
  baseTimelineHash: string;
}): OutputVariantSpec {
  const aspect = input.aspect ?? defaultAspectForVariantKind(input.kind);
  const dims = dimensionsForAspect(aspect);
  let durationCapFrames = input.durationCapFrames;
  if (durationCapFrames === undefined) {
    if (input.kind === 'ceremony_short') {
      durationCapFrames = VARIANT_DURATION_CAPS.ceremony_short;
    } else if (input.kind === 'social_short') {
      durationCapFrames = VARIANT_DURATION_CAPS.social_short;
    }
  }
  const silent = input.silent ?? input.kind === 'silent_captioned';
  const captionsPreferred =
    input.captionsPreferred ?? (input.kind === 'silent_captioned' || silent);
  return parseOutputVariantSpec({
    schemaVersion: OUTPUT_VARIANT_CONTRACT_VERSION,
    id: input.id,
    kind: input.kind,
    aspect,
    width: dims.width,
    height: dims.height,
    durationCapFrames,
    silent,
    captionsPreferred,
    cropPolicy: input.cropPolicy ?? 'inherit_focal',
    baseTimelineHash: input.baseTimelineHash,
    sameProject: true,
    provenance: {
      provider: OUTPUT_VARIANT_ENGINE.name,
      model: 'aspect-parity',
      version: OUTPUT_VARIANT_ENGINE.version,
    },
  });
}
