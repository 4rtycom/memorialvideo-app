'use client';

import { useEffect, useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { creatorT } from '@/lib/creator-ui-messages';
import {
  SHELL_SAVE_EVENT,
  runShellSaveRetry,
  shellSaveMessageKey,
  shellSaveNeedsRetry,
  type ShellSaveEventDetail,
  type ShellSaveState,
} from '@/lib/shell-save-status';

const SAVED_HOLD_MS = 4000;

/**
 * Honest shell save indicator (MV-AUD-002 / MV-AUD-013).
 * Never renders a permanent "Saved automatically" without a successful write ack.
 * Offline / error / unavailable offer a safe Retry (probe then replay pending write).
 */
export function SaveStatus({ locale }: { locale: LaunchLanguage }) {
  const [state, setState] = useState<ShellSaveState>('checking');
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let savedTimer: ReturnType<typeof setTimeout> | undefined;

    void fetch('/api/health/ready', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { persistenceWritable?: boolean }) => {
        if (cancelled) {
          return;
        }
        setState(body.persistenceWritable ? 'idle' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) {
          setState('offline');
        }
      });

    function onSave(event: Event) {
      const detail = (event as CustomEvent<ShellSaveEventDetail>).detail;
      if (!detail?.state) {
        return;
      }
      if (savedTimer) {
        clearTimeout(savedTimer);
        savedTimer = undefined;
      }
      setState(detail.state);
      if (detail.state === 'saved') {
        savedTimer = setTimeout(() => {
          setState((current) => (current === 'saved' ? 'idle' : current));
        }, SAVED_HOLD_MS);
      }
    }

    window.addEventListener(SHELL_SAVE_EVENT, onSave);
    return () => {
      cancelled = true;
      if (savedTimer) {
        clearTimeout(savedTimer);
      }
      window.removeEventListener(SHELL_SAVE_EVENT, onSave);
    };
  }, []);

  function onRetry() {
    startRetry(async () => {
      setState('checking');
      const result = await runShellSaveRetry();
      if (result.kind === 'probe') {
        setState(result.state);
      }
      // When a pending mutation is replayed, it reports saving/saved/failed/offline itself.
    });
  }

  const label = creatorT(locale, shellSaveMessageKey(state));
  const prefix =
    state === 'saved' ? '✓  ' : state === 'failed' || state === 'unavailable' || state === 'offline' ? '⚠  ' : '';
  const showRetry = shellSaveNeedsRetry(state) && !retrying;

  return (
    <span className="save-status" role="status" aria-live="polite" data-save-state={state}>
      <span className="save-status-text">
        {prefix}
        {retrying ? creatorT(locale, 'creator.save.checking') : label}
      </span>
      {showRetry ? (
        <button
          type="button"
          className="btn btn-ghost save-retry"
          onClick={onRetry}
          data-testid="shell-save-retry"
        >
          {creatorT(locale, 'creator.save.retry')}
        </button>
      ) : null}
    </span>
  );
}
