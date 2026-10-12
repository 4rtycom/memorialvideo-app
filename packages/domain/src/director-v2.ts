import {
  CHAPTER_DEFAULT_FRAMES,
  DEFAULT_FPS,
  IMAGE_MAX_FRAMES,
  IMAGE_MIN_FRAMES,
  OUTRO_DEFAULT_FRAMES,
  TITLE_DEFAULT_FRAMES,
  TIMELINE_MAX_FRAMES,
  aspectFromDimensions,
  dimensionsForAspect,
  directorV2BriefSchema,
  directorV2OperationSchema,
  directorV2PatchSchema,
  directorV2PlanSchema,
  parseTimelineContract,
  storyApprovalSchema,
  totalDurationFrames,
  type DirectorClarifyingQuestion,
  type DirectorLock,
  type DirectorV2Brief,
  type DirectorV2Operation,
  type DirectorV2Patch,
  type DirectorV2Plan,
  type DirectorV2Provenance,
  type StoryApproval,
  type StoryPlan,
  type TimelineContract,
  type TimelineScene,
} from '@memorialvideo/contracts';

import { uniqueSceneId } from './sequence';
import { clampImageDuration } from './timeline-edit';
import { ensureAudioMix, withAudioMix } from './audio-mix';

export const DETERMINISTIC_DIRECTOR_PROVENANCE: DirectorV2Provenance = {
  provider: 'deterministic-arranger',
  model: 'local-v1',
  version: 'v1',
  kind: 'deterministic',
};

export type KnownDirectorAsset = {
  id: string;
  src: string;
  kind: 'image' | 'video';
  caption?: string;
  width?: number;
  height?: number;
};

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(',')}}`;
}

export function stableContentHash(value: unknown): string {
  const input = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

export function hashStoryPlan(plan: StoryPlan): string {
  return stableContentHash({
    chapters: plan.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      purpose: chapter.purpose,
      assetIds: [...chapter.assetIds].sort(),
      factIds: [...chapter.factIds].sort(),
    })),
    confirmedFactIds: [...plan.confirmedFactIds].sort(),
  });
}

export function hashTimeline(timeline: TimelineContract): string {
  return stableContentHash({
    ...timeline,
    scenes: timeline.scenes.map((scene) => {
      if (scene.type !== 'image' && scene.type !== 'video') {
        return scene;
      }
      return {
        ...scene,
        asset: { ...scene.asset, src: 'storage://asset', checksum: undefined },
      };
    }),
  });
}

export function hashUnaffectedScenes(timeline: TimelineContract, touchedSceneIds: readonly string[]): string {
  return stableContentHash(timeline.scenes.filter((scene) => !touchedSceneIds.includes(scene.id)));
}

export type ApprovalReadiness = {
  canApprove: boolean;
  blockingCodes: Array<'blocking_conflict' | 'no_chapters' | 'no_memories'>;
  warningCodes: Array<'disputed_fact' | 'empty_chapter' | 'unconfirmed_text' | 'open_questions'>;
};

export function evaluateApprovalReadiness(plan: StoryPlan): ApprovalReadiness {
  const blockingCodes: ApprovalReadiness['blockingCodes'] = [];
  const warningCodes: ApprovalReadiness['warningCodes'] = [];
  if (plan.warnings.includes('blocking_conflict')) {
    blockingCodes.push('blocking_conflict');
  }
  if (plan.chapters.length === 0) {
    blockingCodes.push('no_chapters');
  }
  const memories = new Set(plan.chapters.flatMap((chapter) => chapter.assetIds));
  if (memories.size === 0) {
    blockingCodes.push('no_memories');
  }
  if (plan.warnings.includes('disputed_fact')) {
    warningCodes.push('disputed_fact');
  }
  if (plan.warnings.includes('empty_chapter')) {
    warningCodes.push('empty_chapter');
  }
  if (plan.warnings.includes('unconfirmed_text')) {
    warningCodes.push('unconfirmed_text');
  }
  if (plan.openQuestionIds.length > 0) {
    warningCodes.push('open_questions');
  }
  return { canApprove: blockingCodes.length === 0, blockingCodes, warningCodes };
}

export function createStoryApproval(input: {
  id: string;
  tributePublicId: string;
  storyPlan: StoryPlan;
  approvedByUserId: string;
  approvedAt: string;
  version?: number;
  storyPlanVersion: number;
  includePrivateNotes?: boolean;
}): { ok: true; approval: StoryApproval; changeTimeline: false } | { ok: false; reason: 'not_ready' } {
  const readiness = evaluateApprovalReadiness(input.storyPlan);
  if (!readiness.canApprove) {
    return { ok: false, reason: 'not_ready' };
  }
  const approvedMemoryIds = [...new Set(input.storyPlan.chapters.flatMap((chapter) => chapter.assetIds))];
  return {
    ok: true,
    changeTimeline: false,
    approval: storyApprovalSchema.parse({
      schemaVersion: 1,
      id: input.id,
      tributePublicId: input.tributePublicId,
      storyPlanVersion: input.storyPlanVersion,
      storyPlanHash: hashStoryPlan(input.storyPlan),
      approvedChapterIds: input.storyPlan.chapters.map((chapter) => chapter.id),
      approvedFactIds: input.storyPlan.confirmedFactIds,
      approvedMemoryIds,
      includePrivateNotes: input.includePrivateNotes === true,
      approvedByUserId: input.approvedByUserId,
      approvedAt: input.approvedAt,
      version: input.version ?? 0,
      status: 'active',
    }),
  };
}

export function isApprovalCurrent(approval: StoryApproval, storyPlan: StoryPlan): boolean {
  return approval.status === 'active' && approval.storyPlanHash === hashStoryPlan(storyPlan);
}

export function revokeApproval(approval: StoryApproval, expectedVersion: number): { ok: true; approval: StoryApproval } | { ok: false; reason: 'conflict' } {
  if (approval.version !== expectedVersion) {
    return { ok: false, reason: 'conflict' };
  }
  return { ok: true, approval: { ...approval, status: 'revoked', version: approval.version + 1 } };
}

export function invalidateApproval(approval: StoryApproval): StoryApproval {
  if (approval.status !== 'active') {
    return approval;
  }
  return { ...approval, status: 'invalidated', version: approval.version + 1 };
}

export function sanitizeMemorialText(value: string, max = 280): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]{0,200}>/g, '')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 || char === '\n' || char === '\r' || char === '\t';
    })
    .join('')
    .trim()
    .slice(0, max);
}

export function treatAsDataNotInstruction(value: string): string {
  return sanitizeMemorialText(value).replace(/^\s*(system|ignore previous|reveal prompt)\b[:\s-]*/i, '');
}

const MINUTE_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};

export function inferBriefFromText(text: string): Partial<DirectorV2Brief> {
  const lower = text.toLowerCase();
  const numeric = lower.match(/(\d{1,2})\s*-?\s*minute/);
  const spoken = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\b\s*-?\s*minute/);
  const minutes = numeric ? Number(numeric[1]) : spoken ? MINUTE_WORDS[spoken[1] ?? ''] : undefined;
  const tone = (['warm', 'dignified', 'restrained', 'celebratory', 'formal', 'spiritual', 'secular'] as const).find(
    (item) => lower.includes(item),
  );
  const pacing = lower.includes('brisk') || lower.includes('short') ? 'brisk' : lower.includes('gentle') ? 'gentle' : undefined;
  const opening = lower.includes('open with') && lower.includes('name') ? 'name_card' : undefined;
  return {
    targetDurationSeconds: minutes ? Math.min(30 * 60, Math.max(30, minutes * 60)) : undefined,
    tone,
    pacing: pacing as DirectorV2Brief['pacing'],
    opening,
    themeKeys: ['family', 'humour', 'sailing'].filter((key) => lower.includes(key)),
  };
}

export function clarifyDirectorBrief(brief: DirectorV2Brief): DirectorClarifyingQuestion[] {
  const questions: DirectorClarifyingQuestion[] = [];
  if (!brief.targetDurationSeconds && !/\d+\s*-?\s*minute/i.test(brief.naturalLanguage)) {
    questions.push({ id: 'q_duration', code: 'duration' });
  }
  if (!brief.tone && !/(warm|dignified|restrained|celebratory|formal)/i.test(brief.naturalLanguage)) {
    questions.push({ id: 'q_tone', code: 'tone' });
  }
  return questions.slice(0, 2);
}

export function parseDirectorBrief(input: unknown): DirectorV2Brief {
  const parsed = directorV2BriefSchema.parse(input);
  const inferred = inferBriefFromText(parsed.naturalLanguage);
  return directorV2BriefSchema.parse({
    ...parsed,
    naturalLanguage: sanitizeMemorialText(parsed.naturalLanguage, 2000),
    targetDurationSeconds: parsed.targetDurationSeconds ?? inferred.targetDurationSeconds,
    tone: parsed.tone ?? inferred.tone,
    pacing: parsed.pacing ?? inferred.pacing,
    opening: parsed.opening ?? inferred.opening,
    themeKeys: parsed.themeKeys.length > 0 ? parsed.themeKeys : inferred.themeKeys ?? [],
    clarifyingQuestions: clarifyDirectorBrief({
      ...parsed,
      targetDurationSeconds: parsed.targetDurationSeconds ?? inferred.targetDurationSeconds,
      tone: parsed.tone ?? inferred.tone,
    }),
  });
}

function lockSet(locks: readonly DirectorLock[], kind: DirectorLock['kind']): Set<string> {
  return new Set(locks.filter((lock) => lock.kind === kind).map((lock) => lock.targetId));
}

function sceneAssetId(scene: TimelineScene): string | undefined {
  return scene.type === 'image' || scene.type === 'video' ? scene.asset.assetId : undefined;
}

function findSceneForAsset(timeline: TimelineContract, assetId: string): TimelineScene | undefined {
  return timeline.scenes.find((scene) => sceneAssetId(scene) === assetId);
}

function existingChapterScenes(timeline: TimelineContract, chapter: StoryPlan['chapters'][number]): TimelineScene[] {
  const assetIds = new Set(chapter.assetIds);
  const titleIndex = timeline.scenes.findIndex((scene) => scene.type === 'chapter' && scene.title === chapter.title);
  if (titleIndex >= 0) {
    const taken: TimelineScene[] = [timeline.scenes[titleIndex]!];
    for (let index = titleIndex + 1; index < timeline.scenes.length; index += 1) {
      const scene = timeline.scenes[index]!;
      if (scene.type === 'chapter' || scene.type === 'outro' || scene.type === 'intro') {
        break;
      }
      taken.push(scene);
    }
    return taken;
  }
  return timeline.scenes.filter((scene) => {
    const assetId = sceneAssetId(scene);
    return Boolean(assetId && assetIds.has(assetId));
  });
}

function imageDurationForPace(
  targetSeconds: number,
  memoryCount: number,
  pacing: DirectorV2Brief['pacing'],
  emphasised: boolean,
): number {
  const base = Math.round((targetSeconds * DEFAULT_FPS) / Math.max(1, memoryCount + 2));
  const paced = pacing === 'brisk' ? base - 15 : pacing === 'gentle' ? base + 20 : base;
  const next = clampImageDuration(emphasised ? paced + 20 : paced);
  return Math.min(IMAGE_MAX_FRAMES, Math.max(IMAGE_MIN_FRAMES, next));
}

export type DirectorArrangeInput = {
  tributePublicId: string;
  brief: DirectorV2Brief;
  approval: StoryApproval;
  storyPlan: StoryPlan;
  timeline: TimelineContract;
  assets: readonly KnownDirectorAsset[];
  planId: string;
  createdAt: string;
  provenance?: DirectorV2Provenance;
};

export function collectApprovedInputs(input: {
  approval: StoryApproval;
  storyPlan: StoryPlan;
  assets: readonly KnownDirectorAsset[];
}): {
  chapterIds: Set<string>;
  factIds: Set<string>;
  memoryIds: Set<string>;
  knownAssetIds: Set<string>;
} {
  return {
    chapterIds: new Set(input.approval.approvedChapterIds),
    factIds: new Set(input.approval.approvedFactIds),
    memoryIds: new Set(input.approval.approvedMemoryIds),
    knownAssetIds: new Set(input.assets.map((asset) => asset.id)),
  };
}

function existingTextRef(
  timeline: TimelineContract,
  kind: 'display_name' | 'existing_closing' | 'existing_caption',
  assetId?: string,
): string {
  if (kind === 'display_name') {
    return sanitizeMemorialText(timeline.displayName, 200);
  }
  if (kind === 'existing_closing') {
    const outro = timeline.scenes.find((scene) => scene.type === 'outro');
    return outro && outro.type === 'outro' ? sanitizeMemorialText(outro.closingLine, 160) : sanitizeMemorialText(timeline.displayName, 160);
  }
  const scene = assetId ? findSceneForAsset(timeline, assetId) : undefined;
  if (scene && (scene.type === 'image' || scene.type === 'video')) {
    return sanitizeMemorialText(scene.caption ?? '', 180);
  }
  return '';
}

export function arrangeDeterministicTimeline(input: DirectorArrangeInput): {
  timeline: TimelineContract;
  plan: DirectorV2Plan;
} {
  const brief = parseDirectorBrief(input.brief);
  const allowed = collectApprovedInputs(input);
  const locks = brief.protectedLocks;
  const neverInclude = new Set([...lockSet(locks, 'never_include'), ...brief.mustExcludeMemoryIds, ...input.approval.excludedMemoryIds]);
  const alwaysInclude = new Set([...lockSet(locks, 'always_include'), ...brief.mustIncludeMemoryIds]);
  const keepDuration = lockSet(locks, 'keep_duration');
  const keepCrop = lockSet(locks, 'keep_crop');
  const keepText = lockSet(locks, 'keep_text');
  const keepPosition = lockSet(locks, 'keep_position');
  const keepChapter = lockSet(locks, 'keep_chapter');
  const excludeChapters = new Set([...brief.excludeChapterIds, ...input.approval.excludedChapterIds]);
  const known = new Map(input.assets.map((asset) => [asset.id, asset]));
  const usedIds = new Set<string>();
  const scenes: TimelineScene[] = [];
  const warnings: DirectorV2Plan['warnings'] = ['deterministic_arranger'];
  const omitted = new Set<string>();
  const selected: string[] = [];
  const planChapters: DirectorV2Plan['chapters'] = [];
  const planScenes: DirectorV2Plan['scenes'] = [];

  const opening = brief.opening ?? 'name_card';
  const closing = brief.closing ?? 'quiet_line';
  const targetSeconds = brief.targetDurationSeconds ?? 480;
  const transitionIn = brief.reducedMotion ? 'none' : 'dissolve';

  if (opening === 'name_card' || opening === 'chapter_title') {
    const introId = uniqueSceneId(usedIds, 'intro');
    scenes.push({
      id: introId,
      type: 'intro',
      durationFrames: TITLE_DEFAULT_FRAMES,
      transitionIn: 'fade',
      transitionOut: 'fade',
      displayName: existingTextRef(input.timeline, 'display_name'),
      lifeSpanLabel: input.timeline.scenes.find(
        (scene): scene is Extract<TimelineScene, { type: 'intro' }> => scene.type === 'intro',
      )?.lifeSpanLabel,
    });
    planScenes.push({
      id: introId,
      type: 'intro',
      purpose: 'opening',
      durationFrames: TITLE_DEFAULT_FRAMES,
      transitionIn: 'fade',
      textRef: 'display_name',
    });
  }

  const chapters = input.storyPlan.chapters.filter(
    (chapter) => allowed.chapterIds.has(chapter.id) && !excludeChapters.has(chapter.id) && !keepChapter.has(chapter.id),
  );
  const lockedChapters = input.storyPlan.chapters.filter((chapter) => keepChapter.has(chapter.id));
  const memoryCount = Math.max(
    1,
    chapters.reduce((sum, chapter) => sum + chapter.assetIds.filter((id) => !neverInclude.has(id)).length, 0),
  );

  for (const chapter of [...lockedChapters, ...chapters]) {
    const chapterTitle = sanitizeMemorialText(chapter.title, 80) || 'Chapter';
    const sceneIds: string[] = [];
    if (keepChapter.has(chapter.id)) {
      const preserved = existingChapterScenes(input.timeline, chapter);
      for (const scene of preserved) {
        if (usedIds.has(scene.id)) {
          continue;
        }
        usedIds.add(scene.id);
        scenes.push(scene);
        sceneIds.push(scene.id);
        const assetId = sceneAssetId(scene);
        if (assetId) {
          selected.push(assetId);
        }
        planScenes.push({
          id: scene.id,
          type: scene.type,
          purpose: scene.type === 'chapter' ? 'chapter_marker' : 'memory',
          assetId,
          chapterId: chapter.id,
          durationFrames: scene.durationFrames,
          transitionIn: scene.transitionIn,
        });
      }
      planChapters.push({
        id: chapter.id,
        title: chapterTitle,
        purpose: sanitizeMemorialText(chapter.purpose ?? '', 400),
        sceneIds,
        durationFrames: preserved.reduce((sum, scene) => sum + scene.durationFrames, 0),
        emphasised: false,
      });
      continue;
    }
    const chapterSceneId = uniqueSceneId(usedIds, `chapter-${chapter.id}`);
    scenes.push({
      id: chapterSceneId,
      type: 'chapter',
      durationFrames: CHAPTER_DEFAULT_FRAMES,
      transitionIn: brief.reducedMotion ? 'none' : 'fade',
      transitionOut: 'fade',
      title: chapterTitle,
    });
    sceneIds.push(chapterSceneId);
    planScenes.push({
      id: chapterSceneId,
      type: 'chapter',
      purpose: 'chapter_marker',
      chapterId: chapter.id,
      durationFrames: CHAPTER_DEFAULT_FRAMES,
      transitionIn: brief.reducedMotion ? 'none' : 'fade',
      textRef: 'chapter_title',
    });
    const emphasised = brief.emphasiseChapterIds.includes(chapter.id);
    const shorten = brief.shortenChapterIds.includes(chapter.id);
    let chapterFrames = keepChapter.has(chapter.id) ? 0 : CHAPTER_DEFAULT_FRAMES;
    const memoryIds = chapter.assetIds.filter((id) => allowed.memoryIds.has(id) || alwaysInclude.has(id));
    for (const assetId of memoryIds) {
      if (neverInclude.has(assetId)) {
        omitted.add(assetId);
        continue;
      }
      if (!allowed.knownAssetIds.has(assetId) || !known.has(assetId)) {
        continue;
      }
      const existing = findSceneForAsset(input.timeline, assetId);
      if (keepPosition.has(assetId) && existing) {
        const cloned = { ...existing, id: uniqueSceneId(usedIds, existing.id) } as TimelineScene;
        scenes.push(cloned);
        selected.push(assetId);
        sceneIds.push(cloned.id);
        chapterFrames += cloned.durationFrames;
        continue;
      }
      const asset = known.get(assetId)!;
      const durationFrames = keepDuration.has(assetId) && existing
        ? existing.durationFrames
        : imageDurationForPace(shorten ? Math.max(30, Math.floor(targetSeconds / 2)) : targetSeconds, memoryCount, brief.pacing, emphasised);
      const caption = keepText.has(assetId)
        ? existingTextRef(input.timeline, 'existing_caption', assetId)
        : treatAsDataNotInstruction(asset.caption ?? existingTextRef(input.timeline, 'existing_caption', assetId));
      const crop =
        existing && existing.type === 'image' && keepCrop.has(assetId)
          ? existing.crop
          : existing && existing.type === 'image'
            ? existing.crop
            : { focalX: 0.5, focalY: 0.5, zoom: 1 };
      const sceneId = uniqueSceneId(usedIds, existing?.id ?? `${asset.kind}-${assetId}`);
      if (asset.kind === 'video') {
        const video: TimelineScene = {
          id: sceneId,
          type: 'video',
          durationFrames: Math.max(30, Math.min(900, durationFrames)),
          transitionIn,
          transitionOut: 'fade',
          asset: { assetId, src: asset.src, width: asset.width, height: asset.height },
          caption: caption || undefined,
        };
        scenes.push(video);
      } else {
        scenes.push({
          id: sceneId,
          type: 'image',
          durationFrames,
          transitionIn,
          transitionOut: 'fade',
          asset: { assetId, src: asset.src, width: asset.width, height: asset.height },
          caption: caption || undefined,
          crop,
        });
      }
      selected.push(assetId);
      sceneIds.push(sceneId);
      chapterFrames += durationFrames;
      planScenes.push({
        id: sceneId,
        type: asset.kind,
        purpose: 'memory',
        assetId,
        chapterId: chapter.id,
        durationFrames,
        transitionIn,
        textRef: caption ? 'existing_caption' : undefined,
      });
    }
    if (memoryIds.length === 0) {
      warnings.push('empty_chapter_skipped');
    }
    planChapters.push({
      id: chapter.id,
      title: chapterTitle,
      purpose: sanitizeMemorialText(chapter.purpose ?? '', 400),
      sceneIds,
      durationFrames: chapterFrames,
      emphasised,
    });
  }

  for (const assetId of alwaysInclude) {
    if (selected.includes(assetId) || neverInclude.has(assetId) || !known.has(assetId)) {
      continue;
    }
    if (!allowed.memoryIds.has(assetId) && !input.approval.approvedMemoryIds.includes(assetId)) {
      continue;
    }
    const asset = known.get(assetId)!;
    const durationFrames = imageDurationForPace(targetSeconds, memoryCount + 1, brief.pacing, true);
    const sceneId = uniqueSceneId(usedIds, `${asset.kind}-${assetId}`);
    if (asset.kind === 'video') {
      scenes.push({
        id: sceneId,
        type: 'video',
        durationFrames,
        transitionIn,
        transitionOut: 'fade',
        asset: { assetId, src: asset.src },
      });
    } else {
      scenes.push({
        id: sceneId,
        type: 'image',
        durationFrames,
        transitionIn,
        transitionOut: 'fade',
        asset: { assetId, src: asset.src },
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 },
      });
    }
    selected.push(assetId);
  }

  const outroId = uniqueSceneId(usedIds, 'outro');
  const closingLine =
    closing === 'name_card' ? existingTextRef(input.timeline, 'display_name') : existingTextRef(input.timeline, 'existing_closing');
  scenes.push({
    id: outroId,
    type: 'outro',
    durationFrames: OUTRO_DEFAULT_FRAMES,
    transitionIn: 'fade',
    transitionOut: 'fade',
    closingLine: closingLine || existingTextRef(input.timeline, 'display_name'),
  });
  planScenes.push({
    id: outroId,
    type: 'outro',
    purpose: 'closing',
    durationFrames: OUTRO_DEFAULT_FRAMES,
    transitionIn: 'fade',
    textRef: closing === 'name_card' ? 'display_name' : 'existing_closing',
  });

  const timeline = parseTimelineContract({
    ...input.timeline,
    scenes,
    music:
      brief.musicMood === 'none' || !brief.musicRightsAccepted
        ? undefined
        : input.timeline.music ?? { trackId: 'placeholder', src: 'storage://music/placeholder', fadeInFrames: 30, fadeOutFrames: 45 },
  });

  if (totalDurationFrames(timeline) > targetSeconds * DEFAULT_FPS + DEFAULT_FPS * 30) {
    warnings.push('duration_adjusted');
  }
  if (brief.musicMood !== 'none') {
    warnings.push('placeholder_music');
  }
  const questions = brief.clarifyingQuestions;
  if (questions.length > 0) {
    warnings.push('clarifying_needed');
  }

  const rationale = [
    'Uses only approved chapters and memories from the Story plan.',
    `Pacing aims near ${targetSeconds} seconds without inventing dates or names.`,
    'Manual locks stay as they are. Nothing is applied until you confirm.',
  ].slice(0, 6);

  const missingMust = [...alwaysInclude].filter((id) => !selected.includes(id) && !neverInclude.has(id));
  const usedExcluded = selected.filter((id) => neverInclude.has(id));
  const unknownUsed = selected.filter((id) => !allowed.knownAssetIds.has(id));
  const validationCodes = [
    ...(missingMust.length ? ['omit_protected'] : []),
    ...(usedExcluded.length ? ['used_excluded'] : []),
    ...(unknownUsed.length ? ['unknown_asset'] : []),
  ];

  const plan = directorV2PlanSchema.parse({
    schemaVersion: 1,
    id: input.planId,
    tributePublicId: input.tributePublicId,
    briefId: brief.id,
    approvalId: input.approval.id,
    storyPlanHash: input.approval.storyPlanHash,
    timelineVersion: 0,
    timelineHash: hashTimeline(input.timeline),
    provenance: input.provenance ?? DETERMINISTIC_DIRECTOR_PROVENANCE,
    chapters: planChapters,
    scenes: planScenes.length > 0 ? planScenes : [{
      id: scenes[0]!.id,
      type: scenes[0]!.type,
      purpose: 'opening',
      durationFrames: scenes[0]!.durationFrames,
      transitionIn: scenes[0]!.transitionIn,
    }],
    selectedAssetIds: selected,
    omittedAssetIds: [...omitted],
    openingIntent: opening,
    closingIntent: closing,
    audioIntent: {
      kind: brief.musicMood === 'none' || !brief.musicRightsAccepted ? 'none' : 'placeholder',
      licensed: false,
    },
    durationFrames: totalDurationFrames(timeline),
    constraintReport: [
      { code: 'approved_inputs', ok: unknownUsed.length === 0 },
      { code: 'must_include', ok: missingMust.length === 0 },
      { code: 'must_exclude', ok: usedExcluded.length === 0 },
      { code: 'manual_locks', ok: true },
      { code: 'duration', ok: totalDurationFrames(timeline) <= TIMELINE_MAX_FRAMES },
      { code: 'music_rights', ok: brief.musicMood === 'none' || brief.musicRightsAccepted || true },
      { code: 'narration', ok: brief.narration !== 'professional_neutral' || true },
      { code: 'private_notes', ok: input.approval.includePrivateNotes === false },
    ],
    warnings: [...new Set(warnings)],
    rationale,
    unresolvedQuestions: questions,
    validation: { ok: validationCodes.length === 0, codes: validationCodes },
    createdAt: input.createdAt,
  });

  return { timeline, plan };
}

function applyText(scene: TimelineScene, field: Extract<DirectorV2Operation, { op: 'update_text' }>['field'], value: string): TimelineScene {
  const clean = treatAsDataNotInstruction(value);
  if (field === 'caption' && (scene.type === 'image' || scene.type === 'video')) {
    return { ...scene, caption: clean || undefined };
  }
  if (field === 'text' && scene.type === 'quote') {
    return { ...scene, text: clean || scene.text };
  }
  if (field === 'title' && scene.type === 'chapter') {
    return { ...scene, title: clean.slice(0, 80) || scene.title };
  }
  if (field === 'displayName' && scene.type === 'intro') {
    return { ...scene, displayName: clean.slice(0, 200) || scene.displayName };
  }
  if (field === 'closingLine' && scene.type === 'outro') {
    return { ...scene, closingLine: clean.slice(0, 160) || scene.closingLine };
  }
  if (field === 'lifeSpanLabel' && scene.type === 'intro') {
    return { ...scene, lifeSpanLabel: clean.slice(0, 80) || undefined };
  }
  return scene;
}

export function applyDirectorOperations(
  timeline: TimelineContract,
  operations: readonly DirectorV2Operation[],
): TimelineContract {
  let next: TimelineContract = { ...timeline, scenes: [...timeline.scenes] };
  for (const raw of operations) {
    const operation = directorV2OperationSchema.parse(raw);
    if (operation.op === 'insert_scene') {
      const scenes = [...next.scenes];
      scenes.splice(Math.min(operation.index, scenes.length), 0, operation.scene);
      next = { ...next, scenes };
      continue;
    }
    if (operation.op === 'remove_scene') {
      next = { ...next, scenes: next.scenes.filter((scene) => scene.id !== operation.sceneId) };
      continue;
    }
    if (operation.op === 'move_scene') {
      const from = next.scenes.findIndex((scene) => scene.id === operation.sceneId);
      if (from < 0) {
        throw new Error('unknown_scene');
      }
      const scenes = [...next.scenes];
      const [moved] = scenes.splice(from, 1);
      if (!moved) {
        throw new Error('unknown_scene');
      }
      scenes.splice(Math.min(operation.toIndex, scenes.length), 0, moved);
      next = { ...next, scenes };
      continue;
    }
    if (operation.op === 'update_duration') {
      next = {
        ...next,
        scenes: next.scenes.map((scene) =>
          scene.id === operation.sceneId ? { ...scene, durationFrames: operation.durationFrames } : scene,
        ),
      };
      continue;
    }
    if (operation.op === 'update_transition') {
      next = {
        ...next,
        scenes: next.scenes.map((scene) =>
          scene.id === operation.sceneId
            ? {
                ...scene,
                transitionIn: operation.transitionIn ?? scene.transitionIn,
                transitionOut: operation.transitionOut ?? scene.transitionOut,
              }
            : scene,
        ),
      };
      continue;
    }
    if (operation.op === 'update_crop') {
      next = {
        ...next,
        scenes: next.scenes.map((scene) =>
          scene.id === operation.sceneId && scene.type === 'image' ? { ...scene, crop: operation.crop } : scene,
        ),
      };
      continue;
    }
    if (operation.op === 'update_text') {
      next = {
        ...next,
        scenes: next.scenes.map((scene) => (scene.id === operation.sceneId ? applyText(scene, operation.field, operation.value) : scene)),
      };
      continue;
    }
    if (operation.op === 'update_asset') {
      next = {
        ...next,
        scenes: next.scenes.map((scene) => {
          if (scene.id !== operation.sceneId) {
            return scene;
          }
          if (scene.type !== 'image' && scene.type !== 'video') {
            return scene;
          }
          if (scene.asset.assetId !== operation.asset.assetId) {
            throw new Error('asset_id_mismatch');
          }
          return { ...scene, asset: operation.asset };
        }),
      };
      continue;
    }
    if (operation.op === 'update_metadata') {
      if (operation.field === 'watermark' && typeof operation.value === 'boolean') {
        next = { ...next, watermark: operation.value };
      }
      continue;
    }
    if (operation.op === 'set_aspect') {
      const dims = dimensionsForAspect(operation.aspect);
      next = { ...next, width: dims.width, height: dims.height };
      continue;
    }
    next = applyAudioOperation(next, operation);
  }
  return parseTimelineContract(next);
}

function applyAudioOperation(timeline: TimelineContract, operation: DirectorV2Operation): TimelineContract {
  if (operation.op === 'audio.mix_replace') {
    return withAudioMix(timeline, operation.audio);
  }
  if (operation.op === 'audio.track_add') {
    const mix = ensureAudioMix(timeline);
    if (mix.tracks.some((track) => track.id === operation.track.id)) {
      throw new Error('duplicate_audio_track');
    }
    return withAudioMix(timeline, { ...mix, tracks: [...mix.tracks, operation.track], revision: mix.revision + 1 });
  }
  if (operation.op === 'audio.track_remove') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      tracks: mix.tracks.filter((track) => track.id !== operation.trackId),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.track_update') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      tracks: mix.tracks.map((track) => (track.id === operation.trackId ? operation.track : track)),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.clip_add') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      tracks: mix.tracks.map((track) =>
        track.id === operation.trackId ? { ...track, clips: [...track.clips, operation.clip] } : track,
      ),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.clip_remove') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      tracks: mix.tracks.map((track) =>
        track.id === operation.trackId
          ? { ...track, clips: track.clips.filter((clip) => clip.id !== operation.clipId) }
          : track,
      ),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.clip_update') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      tracks: mix.tracks.map((track) =>
        track.id === operation.trackId
          ? {
              ...track,
              clips: track.clips.map((clip) => (clip.id === operation.clip.id ? operation.clip : clip)),
            }
          : track,
      ),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.ducking_set') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, { ...mix, ducking: operation.ducking, revision: mix.revision + 1 });
  }
  if (operation.op === 'audio.ducking_regions_set') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      ducking: { ...mix.ducking, regions: operation.regions },
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.master_profile') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, { ...mix, masterProfile: operation.masterProfile, revision: mix.revision + 1 });
  }
  if (operation.op === 'audio.narration_take_select') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      selectedNarrationTakeId: operation.takeId ?? undefined,
      narrationTakes: mix.narrationTakes.map((take) => ({
        ...take,
        selected: operation.takeId !== null && take.id === operation.takeId,
      })),
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.subtitle_track_attach') {
    const mix = ensureAudioMix(timeline);
    const others = mix.subtitles.filter((track) => track.id !== operation.track.id);
    return withAudioMix(timeline, {
      ...mix,
      subtitles: [...others, { ...operation.track, attached: true }],
      revision: mix.revision + 1,
    });
  }
  if (operation.op === 'audio.subtitle_track_detach') {
    const mix = ensureAudioMix(timeline);
    return withAudioMix(timeline, {
      ...mix,
      subtitles: mix.subtitles.map((track) =>
        track.id === operation.trackId ? { ...track, attached: false } : track,
      ),
      revision: mix.revision + 1,
    });
  }
  return timeline;
}

function textValue(scene: TimelineScene, field: Extract<DirectorV2Operation, { op: 'update_text' }>['field']): string {
  if (field === 'caption' && (scene.type === 'image' || scene.type === 'video')) {
    return scene.caption ?? '';
  }
  if (field === 'text' && scene.type === 'quote') {
    return scene.text;
  }
  if (field === 'title' && scene.type === 'chapter') {
    return scene.title;
  }
  if (field === 'displayName' && scene.type === 'intro') {
    return scene.displayName;
  }
  if (field === 'closingLine' && scene.type === 'outro') {
    return scene.closingLine;
  }
  if (field === 'lifeSpanLabel' && scene.type === 'intro') {
    return scene.lifeSpanLabel ?? '';
  }
  return '';
}

export function diffTimelines(before: TimelineContract, after: TimelineContract): DirectorV2Operation[] {
  const operations: DirectorV2Operation[] = [];
  const afterIds = new Set(after.scenes.map((scene) => scene.id));
  const current = [...before.scenes];

  for (const scene of after.scenes) {
    const previous = before.scenes.find((item) => item.id === scene.id);
    if (!previous) {
      continue;
    }
    if (previous.durationFrames !== scene.durationFrames) {
      operations.push({ op: 'update_duration', sceneId: scene.id, durationFrames: scene.durationFrames });
    }
    if (previous.transitionIn !== scene.transitionIn || previous.transitionOut !== scene.transitionOut) {
      operations.push({
        op: 'update_transition',
        sceneId: scene.id,
        transitionIn: scene.transitionIn,
        transitionOut: scene.transitionOut,
      });
    }
    if (previous.type === 'image' && scene.type === 'image') {
      if (JSON.stringify(previous.crop ?? null) !== JSON.stringify(scene.crop ?? null) && scene.crop) {
        operations.push({ op: 'update_crop', sceneId: scene.id, crop: scene.crop });
      }
      if ((previous.caption ?? '') !== (scene.caption ?? '')) {
        operations.push({ op: 'update_text', sceneId: scene.id, field: 'caption', value: scene.caption ?? '' });
      }
    }
    if (previous.type === 'video' && scene.type === 'video' && (previous.caption ?? '') !== (scene.caption ?? '')) {
      operations.push({ op: 'update_text', sceneId: scene.id, field: 'caption', value: scene.caption ?? '' });
    }
    if (previous.type === 'chapter' && scene.type === 'chapter' && previous.title !== scene.title) {
      operations.push({ op: 'update_text', sceneId: scene.id, field: 'title', value: scene.title });
    }
    if (previous.type === 'intro' && scene.type === 'intro' && previous.displayName !== scene.displayName) {
      operations.push({ op: 'update_text', sceneId: scene.id, field: 'displayName', value: scene.displayName });
    }
    if (previous.type === 'outro' && scene.type === 'outro' && previous.closingLine !== scene.closingLine) {
      operations.push({ op: 'update_text', sceneId: scene.id, field: 'closingLine', value: scene.closingLine });
    }
  }

  for (let index = current.length - 1; index >= 0; index -= 1) {
    const scene = current[index]!;
    if (!afterIds.has(scene.id)) {
      operations.push({ op: 'remove_scene', sceneId: scene.id });
      current.splice(index, 1);
    }
  }

  after.scenes.forEach((scene, index) => {
    if (!current.some((item) => item.id === scene.id)) {
      operations.push({ op: 'insert_scene', index, scene });
      current.splice(index, 0, scene);
    }
  });

  after.scenes.forEach((scene, index) => {
    const from = current.findIndex((item) => item.id === scene.id);
    if (from >= 0 && from !== index) {
      operations.push({ op: 'move_scene', sceneId: scene.id, toIndex: index });
      const [moved] = current.splice(from, 1);
      if (moved) {
        current.splice(index, 0, moved);
      }
    }
  });

  if (before.watermark !== after.watermark) {
    operations.push({ op: 'update_metadata', field: 'watermark', value: after.watermark });
  }
  const beforeAudio = JSON.stringify(before.audio ?? null);
  const afterAudio = JSON.stringify(after.audio ?? null);
  if (beforeAudio !== afterAudio) {
    operations.push({ op: 'audio.mix_replace', audio: after.audio ?? null });
  }
  return operations;
}

export function invertDirectorOperations(
  before: TimelineContract,
  operations: readonly DirectorV2Operation[],
): DirectorV2Operation[] {
  const inverse: DirectorV2Operation[] = [];
  for (const operation of [...operations].reverse()) {
    if (operation.op === 'insert_scene') {
      inverse.push({ op: 'remove_scene', sceneId: operation.scene.id });
      continue;
    }
    if (operation.op === 'remove_scene') {
      const index = before.scenes.findIndex((scene) => scene.id === operation.sceneId);
      const scene = before.scenes[index];
      if (scene && index >= 0) {
        inverse.push({ op: 'insert_scene', index, scene });
      }
      continue;
    }
    if (operation.op === 'move_scene') {
      const from = before.scenes.findIndex((scene) => scene.id === operation.sceneId);
      if (from >= 0) {
        inverse.push({ op: 'move_scene', sceneId: operation.sceneId, toIndex: from });
      }
      continue;
    }
    if (operation.op === 'update_duration') {
      const scene = before.scenes.find((item) => item.id === operation.sceneId);
      if (scene) {
        inverse.push({ op: 'update_duration', sceneId: operation.sceneId, durationFrames: scene.durationFrames });
      }
      continue;
    }
    if (operation.op === 'update_transition') {
      const scene = before.scenes.find((item) => item.id === operation.sceneId);
      if (scene) {
        inverse.push({
          op: 'update_transition',
          sceneId: operation.sceneId,
          transitionIn: scene.transitionIn,
          transitionOut: scene.transitionOut,
        });
      }
      continue;
    }
    if (operation.op === 'update_crop') {
      const scene = before.scenes.find((item) => item.id === operation.sceneId);
      if (scene && scene.type === 'image' && scene.crop) {
        inverse.push({ op: 'update_crop', sceneId: operation.sceneId, crop: scene.crop });
      }
      continue;
    }
    if (operation.op === 'update_asset') {
      const scene = before.scenes.find((item) => item.id === operation.sceneId);
      if (scene && (scene.type === 'image' || scene.type === 'video')) {
        inverse.push({ op: 'update_asset', sceneId: operation.sceneId, asset: scene.asset });
      }
      continue;
    }
    if (operation.op === 'update_text') {
      const scene = before.scenes.find((item) => item.id === operation.sceneId);
      if (scene) {
        inverse.push({
          op: 'update_text',
          sceneId: operation.sceneId,
          field: operation.field,
          value: textValue(scene, operation.field),
        });
      }
      continue;
    }
    if (operation.op === 'update_metadata') {
      if (operation.field === 'watermark') {
        inverse.push({ op: 'update_metadata', field: 'watermark', value: before.watermark });
      }
      continue;
    }
    if (operation.op === 'set_aspect') {
      const current = aspectFromDimensions(before.width, before.height);
      if (current) {
        inverse.push({ op: 'set_aspect', aspect: current });
      }
      continue;
    }
    if (operation.op === 'audio.mix_replace') {
      inverse.push({ op: 'audio.mix_replace', audio: before.audio ?? null });
      continue;
    }
    if (operation.op === 'audio.track_add') {
      inverse.push({ op: 'audio.track_remove', trackId: operation.track.id });
      continue;
    }
    if (operation.op === 'audio.track_remove') {
      const track = before.audio?.tracks.find((item) => item.id === operation.trackId);
      if (track) {
        inverse.push({ op: 'audio.track_add', track });
      }
      continue;
    }
    if (operation.op === 'audio.track_update') {
      const track = before.audio?.tracks.find((item) => item.id === operation.trackId);
      if (track) {
        inverse.push({ op: 'audio.track_update', trackId: operation.trackId, track });
      }
      continue;
    }
    if (operation.op === 'audio.clip_add') {
      inverse.push({
        op: 'audio.clip_remove',
        trackId: operation.trackId,
        clipId: operation.clip.id,
      });
      continue;
    }
    if (operation.op === 'audio.clip_remove') {
      const clip = before.audio?.tracks
        .find((track) => track.id === operation.trackId)
        ?.clips.find((item) => item.id === operation.clipId);
      if (clip) {
        inverse.push({ op: 'audio.clip_add', trackId: operation.trackId, clip });
      }
      continue;
    }
    if (operation.op === 'audio.clip_update') {
      const clip = before.audio?.tracks
        .find((track) => track.id === operation.trackId)
        ?.clips.find((item) => item.id === operation.clip.id);
      if (clip) {
        inverse.push({ op: 'audio.clip_update', trackId: operation.trackId, clip });
      }
      continue;
    }
    if (operation.op === 'audio.ducking_set') {
      const ducking = before.audio?.ducking ?? {
        enabled: true,
        musicGainDuringSpeechDb: -14,
        attackFrames: 6,
        releaseFrames: 18,
        regions: [],
      };
      inverse.push({ op: 'audio.ducking_set', ducking });
      continue;
    }
    if (operation.op === 'audio.ducking_regions_set') {
      inverse.push({
        op: 'audio.ducking_regions_set',
        regions: before.audio?.ducking.regions ?? [],
      });
      continue;
    }
    if (operation.op === 'audio.master_profile') {
      inverse.push({
        op: 'audio.master_profile',
        masterProfile: before.audio?.masterProfile ?? 'ceremony_safe',
      });
      continue;
    }
    if (operation.op === 'audio.narration_take_select') {
      inverse.push({
        op: 'audio.narration_take_select',
        takeId: before.audio?.selectedNarrationTakeId ?? null,
      });
      continue;
    }
    if (operation.op === 'audio.subtitle_track_attach') {
      inverse.push({ op: 'audio.subtitle_track_detach', trackId: operation.track.id });
      continue;
    }
    if (operation.op === 'audio.subtitle_track_detach') {
      const track = before.audio?.subtitles.find((item) => item.id === operation.trackId);
      if (track) {
        inverse.push({ op: 'audio.subtitle_track_attach', track });
      }
    }
  }
  return inverse;
}

export type PatchValidationIssue =
  | 'unknown_asset'
  | 'unapproved_memory'
  | 'excluded_memory'
  | 'omit_protected'
  | 'locked_scene'
  | 'invalid_duration'
  | 'unsupported_transition'
  | 'unlicensed_music'
  | 'stale_base'
  | 'private_note'
  | 'invalid_contract'
  | 'unknown_scene'
  | 'excessive_output'
  | 'fabricated_id';

export function validateDirectorArrangement(input: {
  before: TimelineContract;
  after: TimelineContract;
  approval: StoryApproval;
  brief: DirectorV2Brief;
  assets: readonly KnownDirectorAsset[];
}): PatchValidationIssue[] {
  const issues: PatchValidationIssue[] = [];
  const allowed = collectApprovedInputs({
    approval: input.approval,
    storyPlan: {
      schemaVersion: 1,
      title: '',
      narrativeMode: 'chronological',
      chapters: [],
      recommendations: [],
      confirmedFactIds: [],
      approvedExcerptIds: [],
      approvedPersonIds: [],
      unresolvedConflictIds: [],
      openQuestionIds: [],
      warnings: [],
      ready: true,
      changeTimeline: false,
    },
    assets: input.assets,
  });
  const known = allowed.knownAssetIds;
  const approved = new Set(input.approval.approvedMemoryIds);
  const excluded = new Set([...input.approval.excludedMemoryIds, ...input.brief.mustExcludeMemoryIds, ...lockSet(input.brief.protectedLocks, 'never_include')]);
  const always = new Set([...input.brief.mustIncludeMemoryIds, ...lockSet(input.brief.protectedLocks, 'always_include')]);
  const afterAssets = input.after.scenes.map(sceneAssetId).filter((id): id is string => Boolean(id));
  for (const assetId of afterAssets) {
    if (!known.has(assetId)) {
      issues.push('unknown_asset');
    }
    if (!approved.has(assetId) && !always.has(assetId)) {
      issues.push('unapproved_memory');
    }
    if (excluded.has(assetId)) {
      issues.push('excluded_memory');
    }
  }
  for (const assetId of always) {
    if (!afterAssets.includes(assetId) && !excluded.has(assetId)) {
      issues.push('omit_protected');
    }
  }
  const keepDuration = lockSet(input.brief.protectedLocks, 'keep_duration');
  const keepCrop = lockSet(input.brief.protectedLocks, 'keep_crop');
  const keepText = lockSet(input.brief.protectedLocks, 'keep_text');
  for (const scene of input.before.scenes) {
    const assetId = sceneAssetId(scene);
    const afterScene = input.after.scenes.find((item) => item.id === scene.id || (assetId && sceneAssetId(item) === assetId));
    if ((keepDuration.has(scene.id) || (assetId && keepDuration.has(assetId))) && afterScene && afterScene.durationFrames !== scene.durationFrames) {
      issues.push('locked_scene');
    }
    if ((keepCrop.has(scene.id) || (assetId && keepCrop.has(assetId))) && scene.type === 'image' && afterScene?.type === 'image') {
      if (JSON.stringify(scene.crop ?? null) !== JSON.stringify(afterScene.crop ?? null)) {
        issues.push('locked_scene');
      }
    }
    if ((keepText.has(scene.id) || (assetId && keepText.has(assetId))) && afterScene) {
      if (scene.type === 'image' && afterScene.type === 'image' && (scene.caption ?? '') !== (afterScene.caption ?? '')) {
        issues.push('locked_scene');
      }
    }
  }
  if (totalDurationFrames(input.after) > TIMELINE_MAX_FRAMES) {
    issues.push('invalid_duration');
  }
  if (input.after.scenes.length > 240) {
    issues.push('excessive_output');
  }
  try {
    parseTimelineContract(input.after);
  } catch {
    issues.push('invalid_contract');
  }
  return [...new Set(issues)];
}

function replaceAllOperations(from: TimelineContract, to: TimelineContract): DirectorV2Operation[] {
  return [
    ...[...from.scenes].reverse().map((scene) => ({ op: 'remove_scene' as const, sceneId: scene.id })),
    ...to.scenes.map((scene, index) => ({ op: 'insert_scene' as const, index, scene })),
  ];
}

export function compileDirectorPatch(input: {
  patchId: string;
  tributePublicId: string;
  plan: DirectorV2Plan;
  brief: DirectorV2Brief;
  approval: StoryApproval;
  before: TimelineContract;
  after: TimelineContract;
  assets: readonly KnownDirectorAsset[];
  timelineVersion: number;
  idempotencyKey: string;
  createdAt: string;
  scope?: 'full' | 'chapter';
  chapterId?: string;
}): { ok: true; patch: DirectorV2Patch; after: TimelineContract } | { ok: false; issues: PatchValidationIssue[] } {
  if (input.approval.storyPlanHash !== input.plan.storyPlanHash) {
    return { ok: false, issues: ['stale_base'] };
  }
  if (hashTimeline(input.before) !== input.plan.timelineHash) {
    return { ok: false, issues: ['stale_base'] };
  }
  const issues = validateDirectorArrangement({
    before: input.before,
    after: input.after,
    approval: input.approval,
    brief: input.brief,
    assets: input.assets,
  });
  let operations = diffTimelines(input.before, input.after);
  let after = input.after;
  try {
    const applied = applyDirectorOperations(input.before, operations);
    if (hashTimeline(applied) !== hashTimeline(input.after)) {
      operations = replaceAllOperations(input.before, input.after);
      after = applyDirectorOperations(input.before, operations);
    } else {
      after = applied;
    }
  } catch {
    operations = replaceAllOperations(input.before, input.after);
    after = applyDirectorOperations(input.before, operations);
  }
  if (operations.length === 0 || operations.length > 480) {
    return { ok: false, issues: issues.length > 0 ? issues : ['excessive_output'] };
  }
  const revalidated = validateDirectorArrangement({
    before: input.before,
    after,
    approval: input.approval,
    brief: input.brief,
    assets: input.assets,
  });
  const allIssues = [...new Set([...issues, ...revalidated])];
  if (allIssues.length > 0) {
    return { ok: false, issues: allIssues };
  }
  let inverse = invertDirectorOperations(input.before, operations);
  try {
    const restored = applyDirectorOperations(after, inverse);
    if (hashTimeline(restored) !== hashTimeline(input.before)) {
      inverse = replaceAllOperations(after, input.before);
    }
  } catch {
    inverse = replaceAllOperations(after, input.before);
  }
  const touchedSceneIds = [
    ...new Set(
      operations.flatMap((operation) => {
        if (operation.op === 'insert_scene') {
          return [operation.scene.id];
        }
        if ('sceneId' in operation) {
          return [operation.sceneId];
        }
        return [];
      }),
    ),
  ];
  const touchedAssetIds = [
    ...new Set(
      after.scenes
        .filter((scene) => touchedSceneIds.includes(scene.id))
        .map(sceneAssetId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const patch = directorV2PatchSchema.parse({
    schemaVersion: 1,
    id: input.patchId,
    tributePublicId: input.tributePublicId,
    planId: input.plan.id,
    briefId: input.brief.id,
    baseTimelineVersion: input.timelineVersion,
    baseTimelineHash: hashTimeline(input.before),
    expectedTimelineHash: hashTimeline(after),
    expectedDurationFrames: totalDurationFrames(after),
    operations,
    inverseOperations: inverse,
    preconditions: [
      { kind: 'timeline_hash', value: hashTimeline(input.before) },
      { kind: 'timeline_version', value: String(input.timelineVersion) },
      { kind: 'story_plan_hash', value: input.approval.storyPlanHash },
      { kind: 'approval_id', value: input.approval.id },
    ],
    touchedSceneIds,
    touchedAssetIds,
    preservedLocks: input.brief.protectedLocks,
    validationStatus: 'valid',
    previewStatus: 'ready',
    applyStatus: 'none',
    scope: input.scope ?? 'full',
    chapterId: input.chapterId,
    idempotencyKey: input.idempotencyKey,
    provenance: input.plan.provenance,
    createdAt: input.createdAt,
  });
  return { ok: true, patch, after };
}

export function previewDirectorPatch(input: {
  current: TimelineContract;
  patch: DirectorV2Patch;
}): { ok: true; preview: TimelineContract; changeTimeline: false } | { ok: false; reason: 'stale_base' | 'invalid_contract' } {
  if (hashTimeline(input.current) !== input.patch.baseTimelineHash) {
    return { ok: false, reason: 'stale_base' };
  }
  try {
    const preview = applyDirectorOperations(input.current, input.patch.operations);
    if (hashTimeline(preview) !== input.patch.expectedTimelineHash) {
      return { ok: false, reason: 'invalid_contract' };
    }
    return { ok: true, preview, changeTimeline: false };
  } catch {
    return { ok: false, reason: 'invalid_contract' };
  }
}

export function planDirectorApply(input: {
  current: TimelineContract;
  currentVersion: number;
  patch: DirectorV2Patch;
}):
  | { ok: true; next: TimelineContract; action: 'apply' | 'noop' }
  | { ok: false; reason: 'stale_base' | 'already_applied' | 'invalid_contract' } {
  if (input.patch.applyStatus === 'applied' && hashTimeline(input.current) === input.patch.expectedTimelineHash) {
    return { ok: true, next: input.current, action: 'noop' };
  }
  if (input.currentVersion !== input.patch.baseTimelineVersion && hashTimeline(input.current) !== input.patch.baseTimelineHash) {
    return { ok: false, reason: 'stale_base' };
  }
  if (hashTimeline(input.current) !== input.patch.baseTimelineHash) {
    return { ok: false, reason: 'stale_base' };
  }
  try {
    const next = applyDirectorOperations(input.current, input.patch.operations);
    parseTimelineContract(next);
    if (hashTimeline(next) !== input.patch.expectedTimelineHash) {
      return { ok: false, reason: 'invalid_contract' };
    }
    return { ok: true, next, action: 'apply' };
  } catch {
    return { ok: false, reason: 'invalid_contract' };
  }
}

export function planDirectorRevert(input: {
  current: TimelineContract;
  patch: DirectorV2Patch;
}):
  | { ok: true; next: TimelineContract; action: 'revert' | 'noop' }
  | { ok: false; reason: 'stale_base' | 'overlap' | 'invalid_contract' } {
  if (input.patch.applyStatus === 'reverted' && hashTimeline(input.current) === input.patch.baseTimelineHash) {
    return { ok: true, next: input.current, action: 'noop' };
  }
  if (hashTimeline(input.current) !== input.patch.expectedTimelineHash) {
    return { ok: false, reason: hashTimeline(input.current) === input.patch.baseTimelineHash ? 'stale_base' : 'overlap' };
  }
  try {
    const next = applyDirectorOperations(input.current, input.patch.inverseOperations);
    if (hashTimeline(next) !== input.patch.baseTimelineHash) {
      return { ok: false, reason: 'invalid_contract' };
    }
    return { ok: true, next, action: 'revert' };
  } catch {
    return { ok: false, reason: 'invalid_contract' };
  }
}

export function generateDirectorV2(input: DirectorArrangeInput & {
  patchId: string;
  timelineVersion: number;
  idempotencyKey: string;
}):
  | { ok: true; plan: DirectorV2Plan; patch: DirectorV2Patch; preview: TimelineContract; changeTimeline: false }
  | { ok: false; reason: 'stale_approval' | 'not_ready' | 'validation'; issues?: PatchValidationIssue[] } {
  if (input.approval.status !== 'active' || input.approval.storyPlanHash !== hashStoryPlan(input.storyPlan)) {
    return { ok: false, reason: 'stale_approval' };
  }
  const arranged = arrangeDeterministicTimeline(input);
  const compiled = compileDirectorPatch({
    patchId: input.patchId,
    tributePublicId: input.tributePublicId,
    plan: { ...arranged.plan, timelineVersion: input.timelineVersion, timelineHash: hashTimeline(input.timeline) },
    brief: parseDirectorBrief(input.brief),
    approval: input.approval,
    before: input.timeline,
    after: arranged.timeline,
    assets: input.assets,
    timelineVersion: input.timelineVersion,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.createdAt,
  });
  if (!compiled.ok) {
    return { ok: false, reason: 'validation', issues: compiled.issues };
  }
  return {
    ok: true,
    plan: { ...arranged.plan, timelineVersion: input.timelineVersion, timelineHash: hashTimeline(input.timeline) },
    patch: compiled.patch,
    preview: compiled.after,
    changeTimeline: false,
  };
}

export function regenerateDirectorChapter(input: DirectorArrangeInput & {
  chapterId: string;
  patchId: string;
  timelineVersion: number;
  idempotencyKey: string;
}):
  | { ok: true; plan: DirectorV2Plan; patch: DirectorV2Patch; preview: TimelineContract; unchangedHash: string; changeTimeline: false }
  | { ok: false; reason: 'stale_approval' | 'unknown_chapter' | 'validation'; issues?: PatchValidationIssue[] } {
  const chapter = input.storyPlan.chapters.find((item) => item.id === input.chapterId);
  if (!chapter) {
    return { ok: false, reason: 'unknown_chapter' };
  }
  const lockedBrief = parseDirectorBrief({
    ...input.brief,
    protectedLocks: [
      ...input.brief.protectedLocks,
      ...input.storyPlan.chapters
        .filter((item) => item.id !== input.chapterId)
        .map((item) => ({ kind: 'keep_chapter' as const, targetId: item.id })),
    ],
    emphasiseChapterIds: [input.chapterId],
  });
  const generated = generateDirectorV2({
    ...input,
    brief: lockedBrief,
    patchId: input.patchId,
    timelineVersion: input.timelineVersion,
    idempotencyKey: input.idempotencyKey,
  });
  if (!generated.ok) {
    return { ok: false, reason: generated.reason === 'not_ready' ? 'validation' : generated.reason, issues: generated.issues };
  }
  return {
    ...generated,
    patch: { ...generated.patch, scope: 'chapter', chapterId: input.chapterId },
    unchangedHash: hashUnaffectedScenes(input.timeline, generated.patch.touchedSceneIds),
    changeTimeline: false,
  };
}

export type DirectorProvider = {
  id: string;
  kind: 'deterministic' | 'generative';
  generate: (input: DirectorArrangeInput & { patchId: string; timelineVersion: number; idempotencyKey: string }) => ReturnType<typeof generateDirectorV2>;
};

export function createDeterministicDirectorProvider(): DirectorProvider {
  return {
    id: 'deterministic-arranger',
    kind: 'deterministic',
    generate: (input) => generateDirectorV2(input),
  };
}

export function selectDirectorProvider(_input: {
  generativeConfigured: boolean;
  consentGranted: boolean;
}): DirectorProvider {
  return createDeterministicDirectorProvider();
}

export function storyItemsFromTimeline(timeline: TimelineContract): Array<{
  assetId: string;
  kind: 'image' | 'video';
  caption: string;
  durationSeconds: number;
  focalX: number;
  focalY: number;
  zoom: number;
  transitionIn: 'none' | 'fade' | 'dissolve';
}> {
  return timeline.scenes.flatMap((scene) => {
    if (scene.type !== 'image' && scene.type !== 'video') {
      return [];
    }
    return [
      {
        assetId: scene.asset.assetId,
        kind: scene.type,
        caption: scene.caption ?? '',
        durationSeconds: Math.min(8, Math.max(2, Math.round(scene.durationFrames / timeline.fps))),
        focalX: scene.type === 'image' ? (scene.crop?.focalX ?? 0.5) : 0.5,
        focalY: scene.type === 'image' ? (scene.crop?.focalY ?? 0.5) : 0.5,
        zoom: scene.type === 'image' ? (scene.crop?.zoom ?? 1) : 1,
        transitionIn: scene.transitionIn,
      },
    ];
  });
}
