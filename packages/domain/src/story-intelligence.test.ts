import { describe, expect, it } from 'vitest';

import type { OwnerSafeAnalysis } from '@memorialvideo/contracts';
import { emptyMemoryContext } from './memory-library';
import {
  detectStoryConflicts,
  firstOpenQuestion,
  planConflictResolution,
  planFactSave,
  planQuestionUpdate,
  projectChronology,
  projectStoryPlan,
  proposeStoryQuestions,
  reorderChapters,
  type StoryMemoryInput,
} from './story-intelligence';
import { lifeStoryChapterSchema, lifeStoryConflictSchema, lifeStoryFactSchema } from '@memorialvideo/contracts';

const analysis = (assetId: string, candidate?: string): OwnerSafeAnalysis => ({
  analysisId: `an-${assetId}`,
  assetId,
  pipelineStatus: 'ready',
  mediaKind: 'photo',
  qualityCodes: [],
  exactDuplicate: false,
  likelyDuplicate: false,
  capturedAtUnconfirmed: Boolean(candidate),
  capturedAtCandidate: candidate,
  locationUnconfirmed: false,
  correctionState: 'unreviewed',
});

const memory = (assetId: string, patch: Partial<StoryMemoryInput> = {}): StoryMemoryInput => ({
  assetId,
  createdAt: '2026-01-02T00:00:00.000Z',
  context: emptyMemoryContext(assetId),
  analysis: analysis(assetId),
  ...patch,
});

describe('story intelligence foundation', () => {
  it('marks unreviewed EXIF candidates as unknown instead of exact', () => {
    const rows = projectChronology([
      memory('exif', {
        analysis: analysis('exif', '2012-06-15T12:00:00.000Z'),
        context: emptyMemoryContext('exif'),
      }),
      memory('confirmed', {
        context: {
          ...emptyMemoryContext('confirmed'),
          dateValue: '2010-01-01',
          datePrecision: 'exact',
          dateProvenance: 'family_confirmed',
        },
        analysis: analysis('confirmed'),
      }),
    ]);
    const exif = rows.find((item) => item.assetId === 'exif');
    expect(exif?.reason).toBe('unreviewed_candidate');
    expect(exif?.unknown).toBe(true);
    expect(exif?.precision).toBe('unknown');
    expect(exif?.displayDate).toBe('2012-06-15');
    expect(rows[0]?.assetId).toBe('confirmed');
  });

  it('honors a family-chosen narrativeMode on StoryPlan projection', () => {
    const plan = projectStoryPlan({
      chapters: [],
      facts: [],
      conflicts: [],
      questions: [],
      narrativeMode: 'thematic',
    });
    expect(plan.narrativeMode).toBe('thematic');
  });

  it('orders confirmed dates before unknown and never invents an exact day from a year', () => {
    const rows = projectChronology([
      memory('u', { createdAt: '2026-01-01T00:00:00.000Z' }),
      memory('y', {
        context: {
          ...emptyMemoryContext('y'),
          dateValue: '1970',
          datePrecision: 'approximate_year',
          dateProvenance: 'family_supplied',
        },
      }),
      memory('e', {
        context: {
          ...emptyMemoryContext('e'),
          dateValue: '1968-04-12',
          datePrecision: 'exact',
          dateProvenance: 'family_confirmed',
        },
      }),
    ]);
    expect(rows.map((item) => item.assetId)).toEqual(['e', 'y', 'u']);
    expect(rows[1]?.precision).toBe('approximate_year');
    expect(rows[1]?.displayDate).toBe('1970');
    expect(rows[2]?.unknown).toBe(true);
    expect(rows[2]?.reason).toBe('unknown');
  });

  it('treats a file candidate that differs from a family date as a discrepancy, not a family fight', () => {
    const conflicts = detectStoryConflicts({
      memories: [
        memory('a', {
          context: {
            ...emptyMemoryContext('a'),
            dateValue: '2018-04-01',
            datePrecision: 'exact',
            dateProvenance: 'family_confirmed',
          },
          analysis: analysis('a', '2010-01-01'),
        }),
      ],
      facts: [],
      existing: [],
    });
    expect(conflicts[0]?.kind).toBe('metadata_discrepancy');
    expect(conflicts[0]?.familyDisagreement).toBe(false);
  });

  it('keeps two family accounts until a person resolves them', () => {
    const facts = [
      lifeStoryFactSchema.parse({
        schemaVersion: 1,
        id: 'f1',
        category: 'life_date',
        subject: 'birth',
        displayWording: 'Born in 1948',
        value: '1948',
        origin: 'family_supplied',
        reviewState: 'disputed',
      }),
      lifeStoryFactSchema.parse({
        schemaVersion: 1,
        id: 'f2',
        category: 'life_date',
        subject: 'birth',
        displayWording: 'Born in 1950',
        value: '1950',
        origin: 'family_supplied',
        reviewState: 'disputed',
      }),
    ];
    const conflicts = detectStoryConflicts({ memories: [], facts, existing: [] });
    expect(conflicts[0]?.familyDisagreement).toBe(true);
    const kept = planConflictResolution({
      existing: conflicts[0]!,
      expectedVersion: 0,
      resolution: 'keep_both',
    });
    expect(kept).toMatchObject({ ok: true, changeTimeline: false, conflict: { state: 'preserved' } });
    expect(planConflictResolution({ existing: conflicts[0]!, expectedVersion: 3, resolution: 'confirm_one' })).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('deduplicates questions and returns skipped ones later', () => {
    const memories = [memory('a')];
    const first = proposeStoryQuestions({ memories, chapters: [], conflicts: [], existing: [] });
    const again = proposeStoryQuestions({ memories, chapters: [], conflicts: [], existing: first });
    expect(again.filter((item) => item.kind === 'when')).toHaveLength(1);
    const skipped = planQuestionUpdate({
      existing: first.find((item) => item.kind === 'when')!,
      expectedVersion: 0,
      state: 'skipped',
    });
    expect(skipped.ok).toBe(true);
    expect(firstOpenQuestion(skipped.ok ? [skipped.question] : [])?.state).toBe('skipped');
  });

  it('reorders chapters without drag-and-drop and leaves TimelineContract alone', () => {
    const chapters = [
      lifeStoryChapterSchema.parse({ schemaVersion: 1, id: 'c1', title: 'First', sortOrder: 0 }),
      lifeStoryChapterSchema.parse({ schemaVersion: 1, id: 'c2', title: 'Second', sortOrder: 1 }),
    ];
    expect(reorderChapters(chapters, 'c2', 'up').map((item) => item.id)).toEqual(['c2', 'c1']);
    const plan = projectStoryPlan({
      chapters: [{ ...chapters[0]!, assetIds: [] }],
      facts: [
        lifeStoryFactSchema.parse({
          schemaVersion: 1,
          id: 'priv',
          category: 'other',
          displayWording: 'Keep this between us',
          origin: 'family_supplied',
          reviewState: 'confirmed',
        }),
      ],
      conflicts: [
        lifeStoryConflictSchema.parse({
          schemaVersion: 1,
          id: 'open',
          kind: 'incompatible_dates',
          factIds: ['a', 'b'],
          familyDisagreement: true,
        }),
      ],
      questions: [],
    });
    expect(plan.changeTimeline).toBe(false);
    expect(plan.warnings).toContain('empty_chapter');
    expect(plan.warnings).toContain('blocking_conflict');
    expect(JSON.stringify(plan)).not.toContain('Keep this between us');
  });

  it('rejects a stale fact version and no-ops an identical save', () => {
    const existing = lifeStoryFactSchema.parse({
      schemaVersion: 1,
      id: 'f1',
      category: 'place',
      displayWording: 'Lisbon',
      origin: 'family_confirmed',
      reviewState: 'confirmed',
      version: 2,
    });
    expect(planFactSave({ existing, next: { ...existing, displayWording: 'Porto' }, expectedVersion: 1 })).toEqual({
      ok: false,
      reason: 'conflict',
    });
    expect(planFactSave({ existing, next: existing, expectedVersion: 2 })).toMatchObject({ ok: true, noop: true });
  });
});
