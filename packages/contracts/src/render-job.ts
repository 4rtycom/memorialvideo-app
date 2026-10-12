import { z } from 'zod';

export const RENDER_JOB_STATUSES = [
  'QUEUED',
  'PREPARING',
  'RENDERING',
  'VERIFYING',
  'READY',
  'FAILED_RETRYABLE',
  'FAILED_FINAL',
  'CANCELED',
] as const;

export type RenderJobStatus = (typeof RENDER_JOB_STATUSES)[number];

export const renderJobStatusSchema = z.enum(RENDER_JOB_STATUSES);

export const TERMINAL_RENDER_STATUSES = ['READY', 'FAILED_FINAL', 'CANCELED'] as const;

export type TerminalRenderStatus = (typeof TERMINAL_RENDER_STATUSES)[number];

export const RENDER_TRANSITIONS: Readonly<Record<RenderJobStatus, readonly RenderJobStatus[]>> = {
  QUEUED: ['PREPARING', 'CANCELED'],
  PREPARING: ['RENDERING', 'FAILED_RETRYABLE', 'CANCELED'],
  RENDERING: ['VERIFYING', 'FAILED_RETRYABLE', 'CANCELED'],
  VERIFYING: ['READY', 'FAILED_RETRYABLE'],
  READY: [],
  FAILED_RETRYABLE: ['QUEUED', 'FAILED_FINAL'],
  FAILED_FINAL: [],
  CANCELED: [],
};

export const renderKindSchema = z.enum(['preview', 'final', 'fallback']);
export type RenderKind = z.infer<typeof renderKindSchema>;
