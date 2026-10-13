'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

type Chapter = {
  id: string;
  title: string;
  yearHint: string;
  memoryIds: string[];
};

type Memory = {
  id: string;
  title: string;
  imagePath: string;
  year: string;
};

export function LifeStoryPanel({
  chapters,
  memories,
  displayName,
}: {
  chapters: Chapter[];
  memories: Memory[];
  displayName: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(chapters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const byId = new Map(memories.map((m) => [m.id, m]));

  function rename(id: string, title: string) {
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storyChapters: rows }),
      });
      if (!response.ok) {
        setError('Could not save chapter titles.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <Card soft className="!p-7">
        <h3 className="serif text-[28px] m-0 mb-2">No chapters yet</h3>
        <p className="text-[color:var(--muted)] mb-4">
          Add ready memories first. We only group by years you supplied — we never invent a life story.
        </p>
        <Button href="/memories">Add memories  ↗</Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.8fr_0.85fr]">
      <Card className="!p-7">
        <h2 className="serif text-[32px] m-0 mb-2">Suggested chapters</h2>
        <p className="text-[color:var(--muted)] mb-5">
          Derived from {displayName}&apos;s ready memories. Edit titles; facts are not invented.
        </p>
        <div className="grid gap-3">
          {rows.map((c) => {
            const first = byId.get(c.memoryIds[0] ?? '');
            return (
              <div key={c.id} className="chapter-row">
                <div className="relative h-[71px] rounded-[11px] overflow-hidden">
                  <Image
                    src={first?.imagePath ?? '/fixtures/memory-a.png'}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="93px"
                  />
                </div>
                <div>
                  <div className="text-[12px] font-bold text-[color:var(--accent)]">{c.id}</div>
                  <input
                    className="field !min-h-[40px] !px-0 !bg-transparent serif text-[22px]"
                    value={c.title}
                    onChange={(e) => rename(c.id, e.target.value)}
                    maxLength={120}
                  />
                  <div className="text-[13px] text-[color:var(--muted)]">
                    {c.memoryIds.length} memories
                    {c.yearHint ? ` · from ${c.yearHint}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button className="mt-5" disabled={pending} onClick={save}>
          Save chapter titles
        </Button>
        {error ? (
          <p className="text-[13px] text-[color:var(--accent)] mt-3" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-[13px] text-[color:var(--muted)] mt-3">Chapter titles saved.</p>
        ) : null}
      </Card>
      <Card soft className="!p-6">
        <h3 className="serif text-[29px] m-0 mb-3">Story intelligence</h3>
        <p className="text-[color:var(--muted)] mb-5">
          Live generative story writing is not complete. This panel only organises family-supplied
          memories.
        </p>
        <Button href="/film/creating" className="btn-block">
          Arrange first film  ↗
        </Button>
        <p className="text-[12px] text-[color:var(--muted)] mt-5 mb-0">Everything can be changed later.</p>
      </Card>
    </div>
  );
}
