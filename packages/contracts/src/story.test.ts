import { describe, expect, it } from 'vitest';

import {
  categoryForLifeFactType,
  lifeStoryFactSchema,
  lifeStoryConflictSchema,
  storyPlanSchema,
} from './story';

describe('life story contracts', () => {
  it('maps product life-fact types onto persisted categories without inventing facts', () => {
    expect(categoryForLifeFactType('birth')).toBe('life_date');
    expect(categoryForLifeFactType('career')).toBe('work');
    expect(categoryForLifeFactType('legacy')).toBe('achievement');
  });

  it('keeps approximate dates from becoming an exact day', () => {
    const fact = lifeStoryFactSchema.parse({
      schemaVersion: 1,
      id: 'sf_1',
      category: 'life_date',
      displayWording: 'Around 1970',
      dateValue: '1970',
      datePrecision: 'approximate_year',
      origin: 'family_supplied',
    });
    expect(fact.datePrecision).toBe('approximate_year');
    expect(fact.dateValue).toBe('1970');
    expect(fact.reviewState).toBe('proposed');
  });

  it('requires quote wording and allows a described source', () => {
    const quote = lifeStoryFactSchema.parse({
      schemaVersion: 1,
      id: 'sf_2',
      category: 'quote',
      displayWording: 'Always make room at the table.',
      quoteSource: 'Remembered by a neighbour',
      origin: 'family_confirmed',
      reviewState: 'confirmed',
    });
    expect(quote.quoteSource).toContain('neighbour');
  });

  it('does not treat a metadata discrepancy as a decided family disagreement', () => {
    const conflict = lifeStoryConflictSchema.parse({
      schemaVersion: 1,
      id: 'sc_1',
      kind: 'metadata_discrepancy',
      factIds: ['sf_1'],
      assetIds: ['a1'],
    });
    expect(conflict.familyDisagreement).toBe(false);
    expect(conflict.state).toBe('open');
  });

  it('keeps StoryPlan from applying the film timeline', () => {
    const plan = storyPlanSchema.parse({
      schemaVersion: 1,
      chapters: [],
      confirmedFactIds: [],
      unresolvedConflictIds: [],
      openQuestionIds: [],
      warnings: [],
      ready: false,
      changeTimeline: false,
    });
    expect(plan.changeTimeline).toBe(false);
    expect(plan.narrativeMode).toBe('chronological');
    expect(plan.recommendations).toEqual([]);
  });

  it('records contributor provenance on facts without treating it as confirmation', () => {
    const fact = lifeStoryFactSchema.parse({
      schemaVersion: 1,
      id: 'sf_contrib',
      category: 'milestone',
      displayWording: 'Wedding day',
      origin: 'family_supplied',
      contributorIds: ['contrib_abc'],
    });
    expect(fact.contributorIds).toEqual(['contrib_abc']);
    expect(fact.reviewState).toBe('proposed');
  });
});
