'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { CREATOR_LAUNCH_LANGUAGES } from '@/lib/creator-ui-messages';

export function LocaleSwitcher({
  locale,
  label,
}: {
  locale: LaunchLanguage;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-[12px] text-[color:var(--muted)]">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        disabled={pending}
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-[12px] text-[color:var(--ink)]"
        value={locale}
        onChange={(event) => {
          const next = event.target.value as LaunchLanguage;
          startTransition(async () => {
            await fetch('/api/locale', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ locale: next }),
            });
            router.refresh();
          });
        }}
      >
        {CREATOR_LAUNCH_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
