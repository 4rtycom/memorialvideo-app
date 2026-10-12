import {
  RENDER_TRANSITIONS,
  type RenderJobStatus,
  TERMINAL_RENDER_STATUSES,
} from '@memorialvideo/contracts';

export class IllegalTransitionError extends Error {
  readonly code = 'ILLEGAL_TRANSITION';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal transition from ${from} to ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransitionRender(from: RenderJobStatus, to: RenderJobStatus): boolean {
  return RENDER_TRANSITIONS[from].includes(to);
}

export function transitionRender(from: RenderJobStatus, to: RenderJobStatus): RenderJobStatus {
  if (!canTransitionRender(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
  return to;
}

export function isTerminalRenderStatus(status: RenderJobStatus): boolean {
  return (TERMINAL_RENDER_STATUSES as readonly string[]).includes(status);
}

export function nextRenderAttempt(attemptCount: number): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 0) {
    throw new Error('attemptCount must be a non-negative integer');
  }
  return attemptCount + 1;
}

export const MAX_RENDER_ATTEMPTS = 4;

export function classifyRetry(attemptCount: number, retryable: boolean): RenderJobStatus {
  if (!retryable) {
    return 'FAILED_FINAL';
  }
  return attemptCount + 1 >= MAX_RENDER_ATTEMPTS ? 'FAILED_FINAL' : 'FAILED_RETRYABLE';
}
