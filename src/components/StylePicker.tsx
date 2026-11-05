'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage, ThemeKey } from '@memorialvideo/contracts';
import { Button, Card } from '@/components/ui';
import { styles } from '@/lib/copy';
import { creatorT } from '@/lib/creator-ui-messages';

export function StylePicker({
  selectedTheme,
  locale = 'en',
}: {
  selectedTheme: ThemeKey;
  locale?: LaunchLanguage;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemeKey>(selectedTheme);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(id: ThemeKey) {
    setError(null);
    setTheme(id);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeKey: id }),
      });
      if (!response.ok) {
        setError(creatorT(locale, 'creator.styles.saveFailed'));
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 mb-6">
        {styles.map((s) => {
          const id = s.id as ThemeKey;
          const selected = theme === id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={pending}
              className="text-left"
              aria-pressed={selected}
              onClick={() => choose(id)}
            >
              <Card
                className={`!p-3 overflow-hidden transition-shadow ${
                  selected ? 'ring-2 ring-[color:var(--accent)]' : ''
                }`}
              >
                <div
                  className="relative h-[200px] rounded-[10px] overflow-hidden mb-0"
                  style={{ background: s.swatch }}
                >
                  <Image src={s.image} alt="" fill className="object-cover opacity-90" sizes="360px" />
                  <div
                    className="absolute inset-x-0 bottom-0 h-1/2"
                    style={{
                      background: `linear-gradient(transparent, ${s.swatch})`,
                    }}
                  />
                  <div
                    className="absolute top-3 left-3 w-8 h-8 rounded-full border border-white/40 shadow-sm"
                    style={{ background: s.accent }}
                    aria-hidden
                  />
                </div>
                <div className="bg-[color:var(--sidebar-active)] rounded-[8px] px-4 py-3 -mt-10 mx-1 relative z-10">
                  <div className="serif text-[28px] leading-none">{s.title}</div>
                </div>
                <p className="px-2 mt-4 mb-4 text-[color:var(--muted)]">{s.desc}</p>
                <div className="px-2 pb-3 flex items-center gap-2 text-[14px]">
                  <span className="w-6 h-6 rounded-full border border-[color:var(--border)] grid place-items-center bg-white">
                    {selected ? '✓' : ''}
                  </span>
                  {selected
                    ? creatorT(locale, 'creator.styles.selected')
                    : creatorT(locale, 'creator.styles.choose')}
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-[13px] text-[color:var(--accent)] mb-4" role="alert">
          {error}
        </p>
      ) : null}
      <Card className="!px-6 !py-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="serif text-[24px]">{creatorT(locale, 'creator.styles.ready')}</div>
          <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.styles.createHint')}</p>
        </div>
        <Button href="/film/creating">{creatorT(locale, 'creator.styles.create')}</Button>
      </Card>
    </>
  );
}
