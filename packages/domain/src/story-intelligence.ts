import {
  lifeStoryChapterSchema,
  lifeStoryConflictSchema,
  lifeStoryFactSchema,
  lifeStoryQuestionSchema,
  storyPlanSchema,
  type ChronologyItem,
  type ChronologyReason,
  type DatePrecision,
  type LifeStoryChapter,
  type LifeStoryConflict,
  type LifeStoryFact,
  type LifeStoryQuestion,
  type MemoryContext,
  type OwnerSafeAnalysis,
  type StoryConflictResolution,
  type StoryPlan,
  type StoryQuestionKind,
  type StoryQuestionState,
} from '@memorialvideo/contracts';

export type StoryMemoryInput = {
  assetId: string;
  createdAt: string;
  context: MemoryContext;
  analysis: OwnerSafeAnalysis;
  familyOrder?: number;
};

export function chronologyReason(context: MemoryContext, analysis: OwnerSafeAnalysis): ChronologyReason {
  if (context.dateProvenance === 'family_confirmed' && context.dateValue) {
    return 'family_confirmed_date';
  }
  if (context.dateProvenance === 'family_supplied' && context.dateValue) {
    return 'family_supplied_date';
  }
  if (context.qualityReview !== 'unreviewed' && analysis.capturedAtCandidate) {
    return 'accepted_candidate';
  }
  if (analysis.capturedAtCandidate && context.dateProvenance === 'unset') {
    return 'unreviewed_candidate';
  }
  return 'unknown';
}

export function chronologyDisplay(context: MemoryContext, analysis: OwnerSafeAnalysis): {
  displayDate: string;
  precision: DatePrecision;
  unknown: boolean;
} {
  if (context.dateValue) {
    return {
      displayDate: context.dateEnd ? `${context.dateValue}–${context.dateEnd}` : context.dateValue,
      precision: context.datePrecision,
      unknown: context.datePrecision === 'unknown',
    };
  }
  if (analysis.capturedAtCandidate) {
    const reason = chronologyReason(context, analysis);
    // Unreviewed EXIF candidates must not claim exact certainty (Prompt 08/09 honesty).
    if (reason === 'unreviewed_candidate') {
      return {
        displayDate: analysis.capturedAtCandidate.slice(0, 10),
        precision: 'unknown',
        unknown: true,
      };
    }
    return {
      displayDate: analysis.capturedAtCandidate.slice(0, 10),
      precision: 'exact',
      unknown: false,
    };
  }
  return { displayDate: '', precision: 'unknown', unknown: true };
}

export function chronologySortKey(displayDate: string, precision: DatePrecision, unknown: boolean, createdAt: string): string {
  if (unknown || !displayDate) {
    return `9-${createdAt}`;
  }
  const start = displayDate.split('–')[0] ?? displayDate;
  if (precision === 'decade') {
    return `5-${start.slice(0, 3)}0`;
  }
  if (precision === 'approximate_year') {
    return `4-${start.slice(0, 4)}`;
  }
  if (precision === 'year') {
    return `3-${start.slice(0, 4)}`;
  }
  if (precision === 'month') {
    return `2-${start.slice(0, 7)}`;
  }
  return `1-${start.slice(0, 10)}`;
}

export function projectChronology(memories: readonly StoryMemoryInput[]): ChronologyItem[] {
  return [...memories]
    .map((memory) => {
      const display = chronologyDisplay(memory.context, memory.analysis);
      const reason =
        memory.familyOrder !== undefined ? ('family_order' as const) : chronologyReason(memory.context, memory.analysis);
      return {
        assetId: memory.assetId,
        sortKey: chronologySortKey(display.displayDate, display.precision, display.unknown, memory.createdAt),
        precision: display.precision,
        displayDate: display.displayDate,
        reason,
        unknown: display.unknown,
        linkedDuplicate: memory.analysis.exactDuplicate,
        familyOrder: memory.familyOrder,
      };
    })
    .sort((left, right) => {
      if (left.familyOrder !== undefined && right.familyOrder !== undefined) {
        return left.familyOrder - right.familyOrder || left.assetId.localeCompare(right.assetId);
      }
      if (left.unknown !== right.unknown) {
        return Number(left.unknown) - Number(right.unknown);
      }
      return left.sortKey.localeCompare(right.sortKey) || left.assetId.localeCompare(right.assetId);
    });
}

export function detectStoryConflicts(input: {
  memories: readonly StoryMemoryInput[];
  facts: readonly LifeStoryFact[];
  existing: readonly LifeStoryConflict[];
}): LifeStoryConflict[] {
  const next = [...input.existing];
  const seen = new Set(input.existing.map((item) => item.id));
  for (const memory of input.memories) {
    const familyDate = memory.context.dateValue;
    const candidate = memory.analysis.capturedAtCandidate?.slice(0, 10);
    if (
      familyDate &&
      candidate &&
      familyDate !== candidate &&
      memory.context.dateProvenance !== 'unset'
    ) {
      const id = `sc_meta_${memory.assetId}`;
      if (!seen.has(id)) {
        next.push(
          lifeStoryConflictSchema.parse({
            schemaVersion: 1,
            id,
            kind: 'metadata_discrepancy',
            factIds: [`sf_meta_${memory.assetId}`],
            assetIds: [memory.assetId],
            familyDisagreement: false,
          }),
        );
        seen.add(id);
      }
    }
  }
  const byKey = new Map<string, LifeStoryFact[]>();
  for (const fact of input.facts) {
    if (fact.reviewState === 'rejected' || fact.reviewState === 'superseded') {
      continue;
    }
    const key = `${fact.category}:${fact.subject || 'life'}`;
    const group = byKey.get(key) ?? [];
    group.push(fact);
    byKey.set(key, group);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) {
      continue;
    }
    const values = new Set(group.map((item) => item.value || item.displayWording));
    if (values.size < 2) {
      continue;
    }
    const id = `sc_facts_${group.map((item) => item.id).sort().join('_')}`.slice(0, 80);
    if (!seen.has(id)) {
      next.push(
        lifeStoryConflictSchema.parse({
          schemaVersion: 1,
          id,
          kind: conflictKindForCategory(group[0]?.category),
          factIds: group.map((item) => item.id),
          familyDisagreement: group.every((item) => item.origin.startsWith('family')),
        }),
      );
    }
  }
  return next;
}

export function questionKey(kind: StoryQuestionKind, assetId?: string, factId?: string, conflictId?: string): string {
  return [kind, assetId ?? '', factId ?? '', conflictId ?? ''].join(':');
}

export function proposeStoryQuestions(input: {
  memories: readonly StoryMemoryInput[];
  chapters: readonly LifeStoryChapter[];
  conflicts: readonly LifeStoryConflict[];
  existing: readonly LifeStoryQuestion[];
}): LifeStoryQuestion[] {
  const existingKeys = new Set(
    input.existing.map((item) => questionKey(item.kind, item.assetId, item.factId, item.conflictId)),
  );
  const assigned = new Set(input.chapters.flatMap((chapter) => chapter.assetIds));
  const proposed: LifeStoryQuestion[] = [...input.existing];
  const add = (question: LifeStoryQuestion) => {
    const key = questionKey(question.kind, question.assetId, question.factId, question.conflictId);
    if (existingKeys.has(key)) {
      return;
    }
    existingKeys.add(key);
    proposed.push(question);
  };
  for (const memory of input.memories) {
    const display = chronologyDisplay(memory.context, memory.analysis);
    if (display.unknown) {
      add(
        lifeStoryQuestionSchema.parse({
          schemaVersion: 1,
          id: `sq_when_${memory.assetId}`.slice(0, 80),
          kind: 'when',
          assetId: memory.assetId,
        }),
      );
    }
    if (!memory.context.locationLabel) {
      add(
        lifeStoryQuestionSchema.parse({
          schemaVersion: 1,
          id: `sq_where_${memory.assetId}`.slice(0, 80),
          kind: 'where',
          assetId: memory.assetId,
        }),
      );
    }
    if (!memory.context.occasionLabel && !memory.context.familyTitle) {
      add(
        lifeStoryQuestionSchema.parse({
          schemaVersion: 1,
          id: `sq_what_${memory.assetId}`.slice(0, 80),
          kind: 'what',
          assetId: memory.assetId,
        }),
      );
    }
    if (!assigned.has(memory.assetId) && input.chapters.length > 0) {
      add(
        lifeStoryQuestionSchema.parse({
          schemaVersion: 1,
          id: `sq_chapter_${memory.assetId}`.slice(0, 80),
          kind: 'chapter',
          assetId: memory.assetId,
        }),
      );
    }
  }
  for (const conflict of input.conflicts) {
    if (conflict.state === 'open' || conflict.state === 'needs_input') {
      add(
        lifeStoryQuestionSchema.parse({
          schemaVersion: 1,
          id: `sq_conflict_${conflict.id}`.slice(0, 80),
          kind: 'conflict',
          conflictId: conflict.id,
        }),
      );
    }
  }
  return proposed;
}

export function firstOpenQuestion(questions: readonly LifeStoryQuestion[]): LifeStoryQuestion | null {
  return questions.find((item) => item.state === 'open') ?? questions.find((item) => item.state === 'skipped') ?? null;
}

export function suggestChapters(memories: readonly StoryMemoryInput[]): LifeStoryChapter[] {
  const suggestions: LifeStoryChapter[] = [];
  const occasions = memories.filter((item) => item.context.occasionLabel);
  if (occasions.length > 0) {
    suggestions.push(
      lifeStoryChapterSchema.parse({
        schemaVersion: 1,
        id: 'sch_suggest_milestones',
        title: 'Milestones',
        kind: 'milestones',
        suggested: true,
        suggestionReason: 'occasion_label',
        origin: 'system_suggested',
        reviewState: 'proposed',
        assetIds: occasions.map((item) => item.assetId),
      }),
    );
  }
  return suggestions;
}

export function projectStoryPlan(input: {
  chapters: readonly LifeStoryChapter[];
  facts: readonly LifeStoryFact[];
  conflicts: readonly LifeStoryConflict[];
  questions: readonly LifeStoryQuestion[];
  approvedExcerptIds?: readonly string[];
  approvedPersonIds?: readonly string[];
  /** Family-chosen narrative shape; defaults to chronological when omitted. */
  narrativeMode?: StoryPlan['narrativeMode'];
}): StoryPlan {
  const warnings: StoryPlan['warnings'] = [];
  for (const fact of input.facts) {
    if (fact.reviewState === 'disputed') {
      warnings.push('disputed_fact');
    }
    if (fact.reviewState === 'proposed' && fact.origin !== 'family_confirmed') {
      warnings.push('unconfirmed_text');
    }
  }
  for (const chapter of input.chapters) {
    if (chapter.assetIds.length === 0) {
      warnings.push('empty_chapter');
    }
  }
  const unresolved = input.conflicts.filter((item) => item.state === 'open' || item.state === 'needs_input');
  if (unresolved.some((item) => item.familyDisagreement)) {
    warnings.push('blocking_conflict');
  }
  const uniqueWarnings = [...new Set(warnings)];
  const recommendations: StoryPlan['recommendations'] = [];
  if (unresolved.length > 0) {
    recommendations.push({
      code: 'review_conflicts',
      message: 'Open story conflicts still need a family look before the plan is ready.',
    });
  }
  if (uniqueWarnings.includes('unconfirmed_text')) {
    recommendations.push({
      code: 'confirm_facts',
      message: 'Confirm proposed facts so the film does not treat suggestions as settled biography.',
    });
  }
  return storyPlanSchema.parse({
    schemaVersion: 1,
    title: '',
    narrativeMode: input.narrativeMode ?? 'chronological',
    chapters: [...input.chapters]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        purpose: chapter.description,
        assetIds: chapter.assetIds,
        factIds: chapter.factIds,
      })),
    recommendations,
    confirmedFactIds: input.facts.filter((item) => item.reviewState === 'confirmed').map((item) => item.id),
    approvedExcerptIds: [...(input.approvedExcerptIds ?? [])],
    approvedPersonIds: [...(input.approvedPersonIds ?? [])],
    unresolvedConflictIds: unresolved.map((item) => item.id),
    openQuestionIds: input.questions.filter((item) => item.state === 'open').map((item) => item.id),
    warnings: uniqueWarnings,
    ready: uniqueWarnings.length === 0 && input.chapters.length > 0,
    changeTimeline: false,
  });
}

export function planFactSave(input: {
  existing: LifeStoryFact | null;
  next: LifeStoryFact;
  expectedVersion: number;
}): { ok: true; fact: LifeStoryFact; noop: boolean } | { ok: false; reason: 'conflict' } {
  const current = input.existing?.version ?? 0;
  if (current !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  if (
    input.existing &&
    input.existing.displayWording === input.next.displayWording &&
    input.existing.reviewState === input.next.reviewState &&
    input.existing.assetIds.join() === input.next.assetIds.join()
  ) {
    return { ok: true, fact: input.existing, noop: true };
  }
  return {
    ok: true,
    noop: false,
    fact: { ...input.next, schemaVersion: 1, version: current + 1 },
  };
}

export function planConflictResolution(input: {
  existing: LifeStoryConflict;
  expectedVersion: number;
  resolution: StoryConflictResolution;
  winnerFactId?: string;
}): { ok: true; conflict: LifeStoryConflict; changeTimeline: false } | { ok: false; reason: 'conflict' } {
  if (input.existing.version !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  const state =
    input.resolution === 'keep_both'
      ? 'preserved'
      : input.resolution === 'dismiss'
        ? 'dismissed'
        : input.resolution === 'leave_unresolved'
          ? 'needs_input'
          : 'resolved';
  return {
    ok: true,
    changeTimeline: false,
    conflict: {
      ...input.existing,
      state,
      resolution: input.resolution,
      winnerFactId: input.winnerFactId,
      version: input.existing.version + 1,
    },
  };
}

export function planQuestionUpdate(input: {
  existing: LifeStoryQuestion;
  expectedVersion: number;
  state: StoryQuestionState;
  answerPreview?: string;
}): { ok: true; question: LifeStoryQuestion } | { ok: false; reason: 'conflict' } {
  if (input.existing.version !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  return {
    ok: true,
    question: {
      ...input.existing,
      state: input.state,
      answerPreview: input.answerPreview ?? input.existing.answerPreview,
      version: input.existing.version + 1,
    },
  };
}

export function planChapterSave(input: {
  existing: LifeStoryChapter | null;
  next: LifeStoryChapter;
  expectedVersion: number;
}): { ok: true; chapter: LifeStoryChapter; noop: boolean } | { ok: false; reason: 'conflict' } {
  const current = input.existing?.version ?? 0;
  if (current !== input.expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  if (input.existing && input.existing.title === input.next.title && input.existing.sortOrder === input.next.sortOrder) {
    const sameMembers =
      input.existing.assetIds.join() === input.next.assetIds.join() &&
      input.existing.description === input.next.description &&
      input.existing.developing === input.next.developing;
    if (sameMembers) {
      return { ok: true, chapter: input.existing, noop: true };
    }
  }
  return { ok: true, noop: false, chapter: { ...input.next, schemaVersion: 1, version: current + 1 } };
}

export function reorderChapters(chapters: readonly LifeStoryChapter[], id: string, direction: 'up' | 'down'): LifeStoryChapter[] {
  const ordered = [...chapters].sort((left, right) => left.sortOrder - right.sortOrder);
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0) {
    return ordered;
  }
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) {
    return ordered;
  }
  const copy = [...ordered];
  const current = copy[index];
  const other = copy[swapWith];
  if (!current || !other) {
    return ordered;
  }
  copy[index] = other;
  copy[swapWith] = current;
  return copy.map((chapter, sortOrder) => ({ ...chapter, sortOrder, version: chapter.version + 1 }));
}

function conflictKindForCategory(category: LifeStoryFact['category'] | undefined): LifeStoryConflict['kind'] {
  if (category === 'place') {
    return 'different_places';
  }
  if (category === 'relationship' || category === 'family') {
    return 'relationship';
  }
  if (category === 'milestone') {
    return 'milestone';
  }
  if (category === 'quote' || category === 'characteristic') {
    return 'name_variants';
  }
  return 'incompatible_dates';
}

export function emptyLifeFact(id: string): LifeStoryFact {
  return lifeStoryFactSchema.parse({
    schemaVersion: 1,
    id,
    category: 'other',
    displayWording: 'Untitled fact',
    origin: 'family_supplied',
  });
}
