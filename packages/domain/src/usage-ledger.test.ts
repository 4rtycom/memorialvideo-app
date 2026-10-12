import { describe, expect, it } from 'vitest';

import {
  estimateUsageCostMicros,
  planCircuitBreaker,
  planUsageBudget,
  shouldRerunIntelligence,
} from './usage-ledger';

describe('usage ledger guardrails', () => {
  it('estimates operational costs without exposing them as customer copy', () => {
    expect(estimateUsageCostMicros('render_attempt', 1)).toBeGreaterThan(0);
    expect(estimateUsageCostMicros('enhancement', 2)).toBeGreaterThan(estimateUsageCostMicros('enhancement', 1));
    expect(estimateUsageCostMicros('storage_bytes', 10 * 1024 * 1024)).toBeGreaterThan(0);
  });

  it('enforces per-package daily and concurrency ceilings', () => {
    expect(
      planUsageBudget({
        packageKey: 'preview',
        operation: 'render_attempt',
        counts: {
          renderAttempts: 8,
          enhancements: 0,
          intelligenceCalls: 0,
          uploadBytes: 0,
          activeJobs: 0,
        },
      }),
    ).toEqual({ ok: false, reason: 'render_attempts_exhausted' });
    expect(
      planUsageBudget({
        packageKey: 'ceremony',
        operation: 'enhancement',
        counts: {
          renderAttempts: 0,
          enhancements: 10,
          intelligenceCalls: 0,
          uploadBytes: 0,
          activeJobs: 4,
        },
      }),
    ).toEqual({ ok: false, reason: 'concurrency_limit' });
    expect(
      planUsageBudget({
        packageKey: 'ceremony',
        operation: 'enhancement',
        counts: {
          renderAttempts: 0,
          enhancements: 10,
          intelligenceCalls: 0,
          uploadBytes: 0,
          activeJobs: 1,
        },
      }),
    ).toEqual({ ok: true });
  });

  it('blocks intelligence and upload bytes when package ceilings are hit', () => {
    expect(
      planUsageBudget({
        packageKey: 'preview',
        operation: 'intelligence_call',
        counts: {
          renderAttempts: 0,
          enhancements: 0,
          intelligenceCalls: 20,
          uploadBytes: 0,
          activeJobs: 0,
        },
      }),
    ).toEqual({ ok: false, reason: 'intelligence_exhausted' });
    expect(
      planUsageBudget({
        packageKey: 'tribute',
        operation: 'storage_bytes',
        counts: {
          renderAttempts: 0,
          enhancements: 0,
          intelligenceCalls: 0,
          uploadBytes: 2 * 1024 * 1024 * 1024,
          activeJobs: 0,
        },
      }),
    ).toEqual({ ok: false, reason: 'upload_bytes_exhausted' });
    expect(
      planUsageBudget({
        packageKey: 'ceremony',
        operation: 'enhancement',
        counts: {
          renderAttempts: 0,
          enhancements: 0,
          intelligenceCalls: 0,
          uploadBytes: 0,
          activeJobs: 0,
        },
        circuitOpen: true,
      }),
    ).toEqual({ ok: false, reason: 'circuit_open' });
  });

  it('opens a circuit after repeated failures and skips revisit-only intelligence', () => {
    const open = planCircuitBreaker({ failureCount: 8, windowMs: 60_000, now: 1_000 });
    expect(open.open).toBe(true);
    expect(
      planCircuitBreaker({
        failureCount: 0,
        windowMs: 60_000,
        now: 1_000 + 60_000,
        openedAt: open.openedAt,
        cooldownMs: 15 * 60_000,
      }).open,
    ).toBe(true);
    expect(
      shouldRerunIntelligence({
        lastCompletedAt: '2026-01-01T00:00:00.000Z',
        inputFingerprint: 'abc',
        lastFingerprint: 'abc',
      }),
    ).toBe(false);
    expect(
      shouldRerunIntelligence({
        lastCompletedAt: '2026-01-01T00:00:00.000Z',
        inputFingerprint: 'abc',
        lastFingerprint: 'xyz',
      }),
    ).toBe(true);
  });
});
