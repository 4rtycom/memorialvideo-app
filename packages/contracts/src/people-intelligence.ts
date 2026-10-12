import { z } from 'zod';

import { aiProvenanceSchema, confidenceSchema, INTELLIGENCE_CONTRACT_VERSION } from './intelligence';

export const PEOPLE_INTELLIGENCE_CONTRACT_VERSION = INTELLIGENCE_CONTRACT_VERSION;

export const PEOPLE_CONSENT_STATES = [
  'disabled',
  'local_approved',
  'external_approved',
  'revoked',
  'pending_deletion',
] as const;
export type PeopleConsentState = (typeof PEOPLE_CONSENT_STATES)[number];

export const PEOPLE_PIPELINE_STATUSES = [
  'queued',
  'processing',
  'ready',
  'partial',
  'failed',
  'cancelled',
] as const;
export type PeoplePipelineStatus = (typeof PEOPLE_PIPELINE_STATUSES)[number];

export const PEOPLE_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'CANCELLED',
] as const;
export type PeopleJobStatus = (typeof PEOPLE_JOB_STATUSES)[number];

export const CLUSTER_REVIEW_STATES = [
  'unreviewed',
  'confirmed_same_person',
  'needs_split',
  'dismissed',
  'superseded',
] as const;
export type ClusterReviewState = (typeof CLUSTER_REVIEW_STATES)[number];

export const PERSON_PRIVACY_STATES = ['private', 'story_eligible', 'film_eligible'] as const;

export const PERSON_RELATIONSHIP_KINDS = [
  'partner',
  'parent',
  'child',
  'grandchild',
  'sibling',
  'relative',
  'friend',
  'colleague',
  'community_member',
  'other',
] as const;

export const PEOPLE_ENGINE = {
  name: 'vladmandic-face-api',
  version: 'v1-local',
  detector: 'tiny_face_detector',
  representation: 'face_recognition_net',
  clustering: 'cosine_threshold_v1',
  kind: 'local' as const,
};

export const peopleConsentSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  tributePublicId: z.string().min(1).max(80),
  state: z.enum(PEOPLE_CONSENT_STATES),
  localApproved: z.boolean().default(false),
  externalApproved: z.boolean().default(false),
  externalProvider: z.string().max(80).optional(),
  policyVersion: z.string().max(40).default('people-intelligence-v1'),
  approvedByUserId: z.string().max(80).optional(),
  approvedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  retainFamilyLabelsOnDeletion: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
  changeTimeline: z.literal(false).default(false),
});
export type PeopleConsent = z.infer<typeof peopleConsentSchema>;

export const faceObservationSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  frameTimestampMs: z.number().int().nonnegative().optional(),
  pageOrFrame: z.string().max(40).optional(),
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }),
  detectionConfidence: confidenceSchema,
  qualityCodes: z.array(z.string().min(1).max(40)).max(12).default([]),
  poseOcclusionCodes: z.array(z.string().min(1).max(40)).max(8).default([]),
  detectorName: z.string().min(1).max(80),
  detectorVersion: z.string().min(1).max(40),
  provenance: aiProvenanceSchema,
  pipelineStatus: z.enum(PEOPLE_PIPELINE_STATUSES),
  reviewState: z.enum(['unreviewed', 'confirmed', 'excluded', 'false_positive']).default('unreviewed'),
  exclusionState: z.enum(['none', 'family_excluded', 'quality_excluded']).default('none'),
  createdAt: z.string().datetime(),
  supersededObservationId: z.string().max(80).optional(),
});
export type FaceObservation = z.infer<typeof faceObservationSchema>;

/** Internal-only. Never returned on owner APIs. */
export const faceRepresentationSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  observationId: z.string().min(1).max(80),
  modelName: z.string().min(1).max(80),
  modelVersion: z.string().min(1).max(40),
  dimensions: z.number().int().positive().max(1024),
  createdAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
});
export type FaceRepresentationMeta = z.infer<typeof faceRepresentationSchema>;

export const personClusterSchemaV2 = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  memberObservationIds: z.array(z.string().min(1).max(80)).min(1).max(500),
  method: z.string().min(1).max(80),
  methodVersion: z.string().min(1).max(40),
  similarityThresholdVersion: z.string().min(1).max(40),
  reviewState: z.enum(CLUSTER_REVIEW_STATES).default('unreviewed'),
  representativeObservationId: z.string().min(1).max(80),
  familyNote: z.string().max(400).optional(),
  version: z.number().int().nonnegative().default(0),
  provenance: aiProvenanceSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  supersededClusterId: z.string().max(80).optional(),
});
export type PersonClusterV2 = z.infer<typeof personClusterSchemaV2>;

export const personProfileSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  tributePublicId: z.string().min(1).max(80),
  displayLabel: z.string().min(1).max(200),
  preferredDescription: z.string().max(400).optional(),
  linkedClusterIds: z.array(z.string().min(1).max(80)).max(40).default([]),
  linkedObservationIds: z.array(z.string().min(1).max(80)).max(500).default([]),
  privacyState: z.enum(PERSON_PRIVACY_STATES).default('private'),
  approvedForStory: z.boolean().default(false),
  approvedForFilm: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
  updatedByUserId: z.string().max(80).optional(),
  updatedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  changeTimeline: z.literal(false).default(false),
});
export type PersonProfile = z.infer<typeof personProfileSchema>;

export const personAssociationSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  personId: z.string().min(1).max(80),
  assetId: z.string().min(1).max(80),
  observationIds: z.array(z.string().min(1).max(80)).max(100).default([]),
  origin: z.enum(['cluster_confirm', 'family_manual', 'merge']).default('cluster_confirm'),
  reviewState: z.enum(['unreviewed', 'confirmed', 'rejected', 'revoked']).default('unreviewed'),
  familyConfirmed: z.boolean().default(false),
  approvedForStory: z.boolean().default(false),
  approvedForFilm: z.boolean().default(false),
  version: z.number().int().nonnegative().default(0),
  provenance: aiProvenanceSchema,
  createdAt: z.string().datetime(),
});
export type PersonAssociation = z.infer<typeof personAssociationSchema>;

export const personRelationshipSchema = z.object({
  schemaVersion: z.literal(PEOPLE_INTELLIGENCE_CONTRACT_VERSION),
  id: z.string().min(1).max(80),
  personId: z.string().min(1).max(80),
  kind: z.enum(PERSON_RELATIONSHIP_KINDS),
  familyWording: z.string().min(1).max(200),
  version: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime(),
  changeTimeline: z.literal(false).default(false),
});
export type PersonRelationship = z.infer<typeof personRelationshipSchema>;

export const peopleIdempotencyKey = (
  assetId: string,
  checksum: string,
  engineVersion: string,
): string => `people_intelligence:${assetId}:${checksum}:${engineVersion}`;

export function sanitizePersonLabel(value: string): string {
  return value
    .replace(/[<>&"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
