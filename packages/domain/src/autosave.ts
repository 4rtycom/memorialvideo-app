import { isStaleWrite } from './project';

export type AutosaveConflictPlan =
  | { action: 'save' }
  | { action: 'conflict'; reason: 'stale_revision' }
  | { action: 'reject'; reason: 'missing_revision' };

/**
 * Prompt 21 — never silently overwrite a newer server revision.
 */
export function planAutosaveWrite(input: {
  clientUpdatedAt: string | undefined;
  serverUpdatedAt: string;
  requireClientRevision: boolean;
}): AutosaveConflictPlan {
  if (input.requireClientRevision && !input.clientUpdatedAt) {
    return { action: 'reject', reason: 'missing_revision' };
  }
  if (isStaleWrite(input.clientUpdatedAt, input.serverUpdatedAt)) {
    return { action: 'conflict', reason: 'stale_revision' };
  }
  return { action: 'save' };
}

export type AutosaveUiState = 'local' | 'saving' | 'saved' | 'failed' | 'conflict' | 'offline';

export function mapAutosaveHttpToUi(input: {
  ok: boolean;
  status: number;
  networkError?: boolean;
}): AutosaveUiState {
  if (input.networkError) {
    return 'offline';
  }
  if (input.status === 409) {
    return 'conflict';
  }
  if (!input.ok) {
    return 'failed';
  }
  return 'saved';
}
