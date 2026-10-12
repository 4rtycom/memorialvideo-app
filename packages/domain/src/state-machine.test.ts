import { describe, expect, it } from 'vitest';

import {
  classifyRetry,
  IllegalTransitionError,
  isTerminalRenderStatus,
  transitionRender,
} from './state-machine.js';

describe('render state machine', () => {
  it('allows the happy path', () => {
    expect(transitionRender('QUEUED', 'PREPARING')).toBe('PREPARING');
    expect(transitionRender('PREPARING', 'RENDERING')).toBe('RENDERING');
    expect(transitionRender('RENDERING', 'VERIFYING')).toBe('VERIFYING');
    expect(transitionRender('VERIFYING', 'READY')).toBe('READY');
    expect(isTerminalRenderStatus('READY')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(() => transitionRender('READY', 'QUEUED')).toThrow(IllegalTransitionError);
    expect(() => transitionRender('CANCELED', 'RENDERING')).toThrow(IllegalTransitionError);
  });

  it('classifies retries with a hard cap', () => {
    expect(classifyRetry(0, true)).toBe('FAILED_RETRYABLE');
    expect(classifyRetry(3, true)).toBe('FAILED_FINAL');
    expect(classifyRetry(0, false)).toBe('FAILED_FINAL');
  });
});
