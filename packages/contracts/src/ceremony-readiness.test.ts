import { describe, expect, it } from 'vitest';

import {
  CEREMONY_READINESS_ENGINE,
  parseCeremonyReadinessConfirmation,
  parseCeremonyReadinessReport,
} from './ceremony-readiness';

describe('ceremony readiness contracts', () => {
  it('requires singleScoreInsufficient and allowlisted finding codes', () => {
    const report = parseCeremonyReadinessReport({
      schemaVersion: 1,
      id: 'crr_test_1',
      version: 0,
      inputHash: 'abc12345deadbeef',
      findings: [
        {
          id: 'f_playback',
          code: 'playback_not_ready',
          severity: 'blocking',
          status: 'open',
          labelKey: 'readiness.finding.playback_not_ready',
          evidenceState: 'observed',
          requiresHumanConfirmation: false,
          confirmationClearsActive: false,
        },
      ],
      blockingCount: 1,
      warningCount: 0,
      suggestionCount: 0,
      confirmationCount: 0,
      activeBlockingCount: 1,
      singleScoreInsufficient: true,
      packPolicy: 'block_on_active_blocking',
      downloadPolicy: 'warn_on_active_blocking',
      checklistPolicy: 'always_allowed_for_owner',
      provenance: CEREMONY_READINESS_ENGINE,
    });
    expect(report.singleScoreInsufficient).toBe(true);
    expect(report.packPolicy).toBe('block_on_active_blocking');
    expect(() =>
      parseCeremonyReadinessReport({
        ...report,
        findings: [
          {
            id: 'f_bad',
            code: 'llm_invented_code',
            severity: 'blocking',
            status: 'open',
            labelKey: 'x',
            evidenceState: 'observed',
          },
        ],
      }),
    ).toThrow();
  });

  it('requires decidedByFamily on confirmations', () => {
    const confirmation = parseCeremonyReadinessConfirmation({
      schemaVersion: 1,
      id: 'crc_1',
      findingId: 'f_names',
      findingCode: 'names_consistency',
      outcome: 'confirm',
      decidedByFamily: true,
      summaryKey: 'readiness.confirmation.confirm',
      version: 0,
    });
    expect(confirmation.decidedByFamily).toBe(true);
    expect(() =>
      parseCeremonyReadinessConfirmation({
        schemaVersion: 1,
        id: 'crc_bad',
        findingId: 'f_names',
        findingCode: 'names_consistency',
        outcome: 'confirm',
        decidedByFamily: false,
        summaryKey: 'readiness.confirmation.confirm',
      }),
    ).toThrow();
  });
});
