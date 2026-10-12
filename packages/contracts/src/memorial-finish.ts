import { z } from 'zod';

/** Memorial Finish selection — never an entire tribute film. */
export const finishSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('still_asset'),
    assetId: z.string().min(1).max(80),
  }),
  z.object({
    kind: z.literal('video_range'),
    assetId: z.string().min(1).max(80),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('title_asset'),
    assetId: z.string().min(1).max(80),
  }),
]);
export type FinishSelectionDto = z.infer<typeof finishSelectionSchema>;

export const finishModeSchema = z.enum(['restore', 'refine', 'stabilize', 'title_polish']);
export type FinishModeDto = z.infer<typeof finishModeSchema>;

export const finishPlanRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectPublicId: z.string().min(8).max(80),
  mode: finishModeSchema,
  selections: z.array(finishSelectionSchema).min(1).max(12),
  consentGranted: z.boolean(),
});
export type FinishPlanRequest = z.infer<typeof finishPlanRequestSchema>;

export const finishPlanResponseSchema = z.object({
  schemaVersion: z.literal(1),
  providerMode: z.enum(['local_deterministic', 'blocked_external']),
  mode: finishModeSchema,
  selectionCount: z.number().int().positive(),
  requiresFamilyReview: z.literal(true),
  mutatesOriginal: z.literal(false),
  /** local_ready when local enqueue path exists; external stays blocked. */
  implementationStatus: z.enum(['planned', 'local_ready', 'blocked_external']),
});
export type FinishPlanResponse = z.infer<typeof finishPlanResponseSchema>;

export const finishJobsRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectPublicId: z.string().min(8).max(80),
  mode: finishModeSchema,
  selections: z.array(finishSelectionSchema).min(1).max(12),
  consentGranted: z.boolean(),
  /** Client-supplied key for idempotent enqueue (hashed server-side with plan). */
  idempotencyKey: z.string().min(8).max(120),
});
export type FinishJobsRequest = z.infer<typeof finishJobsRequestSchema>;

export const finishReviewDecisionSchema = z.enum(['approve', 'reject', 'approve_for_film']);
export type FinishReviewDecisionDto = z.infer<typeof finishReviewDecisionSchema>;

export const finishReviewRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectPublicId: z.string().min(8).max(80),
  jobPublicId: z.string().min(8).max(80),
  decision: finishReviewDecisionSchema,
});
export type FinishReviewRequest = z.infer<typeof finishReviewRequestSchema>;

export function parseFinishPlanRequest(input: unknown): FinishPlanRequest {
  return finishPlanRequestSchema.parse(input);
}

export function parseFinishJobsRequest(input: unknown): FinishJobsRequest {
  return finishJobsRequestSchema.parse(input);
}

export const finishPatchActionSchema = z.enum(['preview', 'apply', 'revert']);
export type FinishPatchActionDto = z.infer<typeof finishPatchActionSchema>;

export const finishPatchRequestSchema = z.object({
  schemaVersion: z.literal(1),
  projectPublicId: z.string().min(8).max(80),
  jobPublicId: z.string().min(8).max(80),
  action: finishPatchActionSchema,
});
export type FinishPatchRequest = z.infer<typeof finishPatchRequestSchema>;

export function parseFinishReviewRequest(input: unknown): FinishReviewRequest {
  return finishReviewRequestSchema.parse(input);
}

export function parseFinishPatchRequest(input: unknown): FinishPatchRequest {
  return finishPatchRequestSchema.parse(input);
}
