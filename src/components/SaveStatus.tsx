'use client';

import { useEffect, useState } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { creatorT } from '@/lib/creator-ui-messages';
import {
  SHELL_SAVE_EVENT,
  shellSaveMessageKey,
  type ShellSaveEventDetail,
  type ShellSaveState,
} from '@/lib/shell-save-status';

const SAVED_HOLD_MS = 4000;

/**
 * Honest shell save indicator (MV-AUD-002 / MV-AUD-013).
 * Never renders a permanent "Saved automatically" without a successful write ack.
 */
export function SaveStatus({ locale }: { locale: LaunchLanguage }) {
  const [state, setState] = useState<ShellSaveState>('checking');

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

  const label = creatorT(locale, shellSaveMessageKey(state));
  const prefix =
    state === 'saved' ? '✓  ' : state === 'failed' || state === 'unavailable' || state === 'offline' ? '⚠  ' : '';

  return (
    <span role="status" aria-live="polite" data-save-state={state}>
      {prefix}
      {label}
    </span>
  );
}
