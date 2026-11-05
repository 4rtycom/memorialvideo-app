import type { AutosaveUiState } from '@memorialvideo/domain';
import type { CreatorUiKey } from '@/lib/creator-ui-messages';

/** Shell top-bar save indicator — never claims "saved" without an acknowledged write. */
export type ShellSaveState =
  | 'checking'
  | 'unavailable'
  | 'idle'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'offline';

export const SHELL_SAVE_EVENT = 'mv:shell-save';

export type ShellSaveEventDetail = {
  state: Extract<ShellSaveState, 'saving' | 'saved' | 'failed' | 'offline'>;
};

export type ShellSaveRetryFn = () => void | Promise<void>;

let pendingRetry: ShellSaveRetryFn | null = null;

export function shellSaveMessageKey(state: ShellSaveState): CreatorUiKey {
  switch (state) {
    case 'checking':
      return 'creator.save.checking';
    case 'unavailable':
      return 'creator.save.unavailable';
    case 'saving':
      return 'creator.save.saving';
    case 'saved':
      return 'creator.save.saved';
    case 'failed':
      return 'creator.save.failed';
    case 'offline':
      return 'creator.save.offline';
    case 'idle':
    default:
      return 'creator.save.idle';
  }
}

/** Offline / failed / unavailable surfaces offer a safe retry. */
export function shellSaveNeedsRetry(state: ShellSaveState): boolean {
  return state === 'failed' || state === 'offline' || state === 'unavailable';
}

export function setShellSaveRetry(fn: ShellSaveRetryFn | null): void {
  pendingRetry = fn;
}

export function clearShellSaveRetry(): void {
  pendingRetry = null;
}

export function hasShellSaveRetry(): boolean {
  return pendingRetry !== null;
}

export function reportShellSave(state: ShellSaveEventDetail['state']): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<ShellSaveEventDetail>(SHELL_SAVE_EVENT, {
      detail: { state },
    }),
  );
}

/** Map editor autosave UI onto the shell indicator after an HTTP ack. */
export function reportShellSaveFromAutosave(ui: AutosaveUiState): void {
  switch (ui) {
    case 'saving':
      reportShellSave('saving');
      return;
    case 'saved':
      clearShellSaveRetry();
      reportShellSave('saved');
      return;
    case 'offline':
      reportShellSave('offline');
      return;
    case 'failed':
    case 'conflict':
      reportShellSave('failed');
      return;
    default:
      return;
  }
}

/**
 * Re-check whether storage is writable. Does not claim "saved".
 * Used before replaying a pending mutation.
 */
export async function probeShellPersistence(
  fetchImpl: typeof fetch = fetch,
): Promise<Extract<ShellSaveState, 'idle' | 'unavailable' | 'offline'>> {
  try {
    const response = await fetchImpl('/api/health/ready', { cache: 'no-store' });
    if (!response.ok) {
      return 'offline';
    }
    const body = (await response.json()) as { persistenceWritable?: boolean };
    return body.persistenceWritable ? 'idle' : 'unavailable';
  } catch {
    return 'offline';
  }
}

/**
 * Safe retry: probe storage first, then replay at most one registered mutation.
 * Returns the probe/idle outcome when no mutation is pending; mutation handlers
 * report their own saving/saved/failed/offline via `reportShellSave`.
 */
export async function runShellSaveRetry(
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { kind: 'probe'; state: Extract<ShellSaveState, 'idle' | 'unavailable' | 'offline'> }
  | { kind: 'replayed' }
> {
  const probed = await probeShellPersistence(fetchImpl);
  if (probed !== 'idle') {
    return { kind: 'probe', state: probed };
  }
  const retry = pendingRetry;
  if (!retry) {
    return { kind: 'probe', state: 'idle' };
  }
  await retry();
  return { kind: 'replayed' };
}
