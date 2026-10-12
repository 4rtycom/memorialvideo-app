'use client';

import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { creatorT } from '@/lib/creator-ui-messages';

type Checklist = {
  downloadDevice: boolean;
  testVenue: boolean;
  soundtrackCleared: boolean;
  updatedAt: string | null;
};

const ITEMS: Array<{ key: keyof Omit<Checklist, 'updatedAt'>; label: string }> = [
  { key: 'downloadDevice', label: 'Download to your device' },
  { key: 'testVenue', label: 'Test playback with the venue' },
  { key: 'soundtrackCleared', label: 'Confirm the soundtrack is cleared for use' },
];

export function CeremonyChecklistPanel({
  initial,
  locale = 'en',
}: {
  initial: Checklist;
  locale?: LaunchLanguage;
}) {
  const [checklist, setChecklist] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof Omit<Checklist, 'updatedAt'>) {
    const nextValue = !checklist[key];
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/ceremony-checklist', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [key]: nextValue }),
      });
      if (!response.ok) {
        setError('Could not save the checklist. Please try again.');
        return;
      }
      const body = (await response.json()) as { checklist: Checklist };
      setChecklist(body.checklist);
    });
  }

  return (
    <div className="border-t border-[color:var(--border)] pt-5 mt-5">
      <h3 className="serif text-[23px] m-0 mb-4">Before the ceremony</h3>
      <ul className="list-none p-0 m-0 grid gap-3 text-[14px]">
        {ITEMS.map((item) => (
          <li key={item.key}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checklist[item.key]}
                disabled={pending}
                onChange={() => toggle(item.key)}
              />
              <span className={checklist[item.key] ? '' : 'text-[color:var(--muted)]'}>
                {checklist[item.key] ? '✓  ' : '○  '}
                {item.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-[color:var(--muted)] mt-4 mb-0">
        <a href="/api/ceremony-checklist/download" data-testid="ceremony-checklist-download">
          {creatorT(locale, 'creator.share.checklistDownload')}
        </a>
        {' — '}
        {creatorT(locale, 'creator.share.checklistDownloadHint')}
      </p>
      {error ? (
        <p className="text-[13px] text-[color:var(--accent)] mt-3 mb-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
