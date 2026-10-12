export const DELETION_STATES = ['requested', 'processing', 'completed', 'failed'] as const;
export type DeletionState = (typeof DELETION_STATES)[number];

export type DeletionManifest = {
  projectId: string;
  tables: readonly string[];
  storagePrefixes: readonly string[];
};

export function canRequestDeletion(lifecycleStatus: string): boolean {
  return lifecycleStatus !== 'DELETED' && lifecycleStatus !== 'DELETION_PENDING';
}

export function nextDeletionState(from: DeletionState, to: DeletionState): DeletionState {
  const allowed: Record<DeletionState, readonly DeletionState[]> = {
    requested: ['processing', 'failed'],
    processing: ['completed', 'failed'],
    completed: [],
    failed: ['requested'],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`illegal_deletion_transition:${from}:${to}`);
  }
  return to;
}

export function buildDeletionManifest(input: {
  projectId: string;
  assetIds: readonly string[];
  jobIds: readonly string[];
}): DeletionManifest {
  return {
    projectId: input.projectId,
    tables: ['assets', 'asset_variants', 'timelines', 'timeline_items', 'render_jobs', 'render_outputs', 'render_snapshots'],
    storagePrefixes: [
      `projects/${input.projectId}/`,
      ...input.assetIds.map((assetId) => `projects/${input.projectId}/assets/${assetId}/`),
      ...input.jobIds.map((jobId) => `projects/${input.projectId}/renders/${jobId}/`),
    ],
  };
}

export function planOrphanSweep(input: {
  listedKeys: readonly string[];
  knownKeys: readonly string[];
  projectPrefix: string;
}): string[] {
  const known = new Set(input.knownKeys);
  return input.listedKeys.filter(
    (key) => key.startsWith(input.projectPrefix) && !known.has(key) && !key.includes('..'),
  );
}

export function isRetentionDue(scheduledDeleteAt: string | null, now: Date): boolean {
  if (!scheduledDeleteAt) {
    return false;
  }
  return Date.parse(scheduledDeleteAt) <= now.getTime();
}

export type RetentionCandidate = {
  projectId: string;
  lifecycleStatus: string;
  scheduledDeleteAt: string | null;
  hasPaidEntitlement: boolean;
};

export function planRetentionSweep(candidates: readonly RetentionCandidate[], now: Date): string[] {
  return candidates
    .filter(
      (row) =>
        !row.hasPaidEntitlement &&
        canRequestDeletion(row.lifecycleStatus) &&
        isRetentionDue(row.scheduledDeleteAt, now),
    )
    .map((row) => row.projectId);
}

export function canRunRetentionSweep(appEnv: string): boolean {
  return appEnv === 'local';
}
