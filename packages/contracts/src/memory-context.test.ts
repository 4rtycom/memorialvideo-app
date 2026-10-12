import { describe, expect, it } from 'vitest';

import { memoryContextSchema, duplicateDecisionSchema } from './memory-context';

describe('memory context contract', () => {
  it('allows unknown dates and unset importance', () => {
    const parsed = memoryContextSchema.parse({
      schemaVersion: 1,
      assetId: 'asset-1',
      datePrecision: 'unknown',
      importance: 'unset',
    });
    expect(parsed.dateValue).toBe('');
    expect(parsed.reviewState).toBe('unreviewed');
    expect(parsed.privateNote).toBe('');
    expect(parsed.version).toBe(0);
  });

  it('accepts month and year precision without forcing an exact day', () => {
    expect(
      memoryContextSchema.parse({
        schemaVersion: 1,
        assetId: 'asset-2',
        dateValue: '1984-06',
        datePrecision: 'month',
        dateProvenance: 'family_supplied',
      }).datePrecision,
    ).toBe('month');
    expect(
      memoryContextSchema.parse({
        schemaVersion: 1,
        assetId: 'asset-3',
        dateValue: '1970',
        datePrecision: 'approximate_year',
        dateProvenance: 'family_supplied',
      }).datePrecision,
    ).toBe('approximate_year');
  });

  it('keeps duplicate decisions on a canonical pair without a preferred delete', () => {
    const parsed = duplicateDecisionSchema.parse({
      schemaVersion: 1,
      assetIdLow: 'a',
      assetIdHigh: 'b',
      kind: 'likely',
      decision: 'different',
    });
    expect(parsed.preferredAssetId).toBeUndefined();
    expect(parsed.decision).toBe('different');
  });
});
