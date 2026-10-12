import {
  preferredTransitionForTheme,
  scaleImageDurationSeconds,
  type ThemeKey,
} from '@memorialvideo/contracts';

export const DIRECTOR_PLAN_VERSION = 1 as const;

export type DirectorUncertainty = 'confident' | 'review_suggested' | 'unknown';

export type DirectorReason =
  | 'needs_name'
  | 'needs_memories'
  | 'opening_from_name'
  | 'pace_from_count'
  | 'dissolve_default'
  | 'chapters_from_count'
  | 'music_placeholder'
  | 'dated_first';

export type DirectorCheck = {
  severity: 'block' | 'warn' | 'info';
  reason: DirectorReason;
  uncertainty: DirectorUncertainty;
};

export type DirectorPlan = {
  version: typeof DIRECTOR_PLAN_VERSION;
  canApply: boolean;
  displayName: string;
  themeKey: ThemeKey;
  music: 'none' | 'placeholder';
  chapterTitles: string[];
  imageDurationSeconds: number;
  transitionIn: 'none' | 'fade' | 'dissolve';
  reasons: DirectorReason[];
  checks: DirectorCheck[];
};

export function paceDurationSeconds(readyCount: number): number {
  if (readyCount <= 5) {
    return 6;
  }
  if (readyCount <= 14) {
    return 4;
  }
  return 3;
}

export function directorChapterCount(readyCount: number): 0 | 1 | 2 | 3 {
  if (readyCount <= 0) {
    return 0;
  }
  if (readyCount >= 12) {
    return 3;
  }
  if (readyCount >= 6) {
    return 2;
  }
  return 1;
}

export function proposeDirectorPlan(input: {
  displayName: string;
  themeKey: ThemeKey;
  readyCount: number;
  datedCount?: number;
  music?: 'none' | 'placeholder';
  chapterTitles: readonly string[];
}): DirectorPlan {
  const displayName = input.displayName.trim().slice(0, 80);
  const readyCount = Math.max(0, Math.floor(input.readyCount));
  const cleaned = input.chapterTitles.map((title) => title.trim().slice(0, 80)).filter(Boolean);
  const chapterNeed = directorChapterCount(readyCount);
  const chapterTitles =
    chapterNeed === 3
      ? cleaned.slice(0, 3)
      : chapterNeed === 2
        ? [cleaned[0], cleaned[2] ?? cleaned[1]].filter((title): title is string => Boolean(title))
        : cleaned.slice(0, 1);
  const checks: DirectorCheck[] = [];
  if (!displayName) {
    checks.push({ severity: 'block', reason: 'needs_name', uncertainty: 'unknown' });
  }
  if (readyCount === 0) {
    checks.push({ severity: 'block', reason: 'needs_memories', uncertainty: 'unknown' });
  }
  if (displayName && readyCount > 0) {
    checks.push({ severity: 'info', reason: 'opening_from_name', uncertainty: 'confident' });
    checks.push({ severity: 'info', reason: 'pace_from_count', uncertainty: 'confident' });
    checks.push({ severity: 'info', reason: 'dissolve_default', uncertainty: 'confident' });
    if (chapterNeed > 0) {
      checks.push({
        severity: 'info',
        reason: 'chapters_from_count',
        uncertainty: chapterNeed === 1 ? 'review_suggested' : 'confident',
      });
    }
    checks.push({
      severity: 'info',
      reason: 'music_placeholder',
      uncertainty: 'review_suggested',
    });
    if ((input.datedCount ?? 0) > 0) {
      checks.push({ severity: 'info', reason: 'dated_first', uncertainty: 'confident' });
    }
  }
  const canApply = checks.every((check) => check.severity !== 'block');
  const transitionIn = preferredTransitionForTheme(input.themeKey);
  return {
    version: DIRECTOR_PLAN_VERSION,
    canApply,
    displayName,
    themeKey: input.themeKey,
    music: input.music === 'placeholder' || canApply ? 'placeholder' : 'none',
    chapterTitles,
    imageDurationSeconds: scaleImageDurationSeconds(
      input.themeKey,
      paceDurationSeconds(readyCount),
    ),
    transitionIn,
    reasons: checks.map((check) => check.reason),
    checks,
  };
}

export type DirectorFileSnap = {
  localId: string;
  assetId?: string;
  durationSeconds?: number;
  transitionIn?: 'none' | 'fade' | 'dissolve';
};

export type DirectorSnapshot = {
  chapterTitle: string;
  chapters: string[];
  music: 'none' | 'placeholder' | 'uploaded';
  files: DirectorFileSnap[];
};

export type DirectorRun = {
  id: string;
  action: 'first_cut';
  reasons: DirectorReason[];
  appliedAt: string;
};

export function captureDirectorSnapshot(input: {
  chapterTitle: string;
  chapters?: readonly string[];
  music: 'none' | 'placeholder' | 'uploaded';
  files: readonly DirectorFileSnap[];
}): DirectorSnapshot {
  return {
    chapterTitle: input.chapterTitle,
    chapters: [...(input.chapters ?? [])],
    music: input.music,
    files: input.files.map((file) => ({
      localId: file.localId,
      assetId: file.assetId,
      durationSeconds: file.durationSeconds,
      transitionIn: file.transitionIn,
    })),
  };
}

export function createDirectorRun(plan: DirectorPlan, appliedAt: string, id: string): DirectorRun {
  return {
    id,
    action: 'first_cut',
    reasons: plan.reasons,
    appliedAt,
  };
}

export function revertDirectorFiles<T extends DirectorFileSnap>(
  files: readonly T[],
  before: DirectorSnapshot,
): T[] {
  const byLocalId = new Map(before.files.map((file) => [file.localId, file]));
  const byAssetId = new Map(
    before.files
      .filter((file): file is DirectorFileSnap & { assetId: string } => Boolean(file.assetId))
      .map((file) => [file.assetId, file]),
  );
  return files.map((file) => {
    const snap = (file.assetId ? byAssetId.get(file.assetId) : undefined) ?? byLocalId.get(file.localId);
    if (!snap) {
      return file;
    }
    return {
      ...file,
      durationSeconds: snap.durationSeconds,
      transitionIn: snap.transitionIn,
    };
  });
}

export function preflightMemorial(input: { displayName: string; readyCount: number }): {
  blockers: DirectorReason[];
  warnings: DirectorReason[];
} {
  const plan = proposeDirectorPlan({
    displayName: input.displayName,
    themeKey: 'timeless',
    readyCount: input.readyCount,
    chapterTitles: [],
  });
  return {
    blockers: plan.checks.filter((check) => check.severity === 'block').map((check) => check.reason),
    warnings: plan.checks.filter((check) => check.severity === 'warn').map((check) => check.reason),
  };
}
