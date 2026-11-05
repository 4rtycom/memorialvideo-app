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
