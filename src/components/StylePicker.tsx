'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import { styles } from '@/lib/copy';

export function StylePicker({ selectedTheme }: { selectedTheme: 'timeless' | 'joyful' | 'peaceful' }) {
  const router = useRouter();
  const [theme, setTheme] = useState(selectedTheme);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(id: 'timeless' | 'joyful' | 'peaceful') {
    setError(null);
    setTheme(id);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ themeKey: id }),
      });
      if (!response.ok) {
        setError('Could not save atmosphere.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-5 md:grid-cols-3 mb-6">
        {styles.map((s) => {
          const id = s.id as 'timeless' | 'joyful' | 'peaceful';
          const selected = theme === id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={pending}
              className="text-left"
              onClick={() => choose(id)}
            >
              <Card className="!p-3 overflow-hidden">
                <div className="relative h-[241px] rounded-[10px] overflow-hidden mb-0">
                  <Image src={s.image} alt="" fill className="object-cover" sizes="312px" />
                </div>
                <div className="bg-[color:var(--sidebar-active)] rounded-[8px] px-4 py-3 -mt-10 mx-1 relative z-10">
                  <div className="serif text-[34px] leading-none">{s.title}</div>
                </div>
                <p className="px-2 mt-4 mb-4 text-[color:var(--muted)]">{s.desc}</p>
                <div className="px-2 pb-3 flex items-center gap-2 text-[14px]">
                  <span className="w-6 h-6 rounded-full border border-[color:var(--border)] grid place-items-center bg-white">
                    {selected ? '✓' : ''}
                  </span>
                  {selected ? 'Selected' : 'Choose this style'}
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
          <div className="serif text-[24px]">Ready whenever you are.</div>
          <p className="text-[color:var(--muted)] m-0">
            Your first film will use the memories you have now and the atmosphere you chose.
          </p>
        </div>
        <Button href="/film/creating">Create the first film  ↗</Button>
      </Card>
    </>
  );
}
