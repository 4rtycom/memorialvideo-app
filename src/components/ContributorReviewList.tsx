'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

export type IncomingMemory = {
  id: string;
  title: string;
  imagePath: string;
  contributorName?: string;
  contributorNote?: string;
  reviewState: 'pending' | 'accepted' | 'declined';
  label: string;
};

export function ContributorReviewList({ items }: { items: IncomingMemory[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function review(memoryId: string, reviewState: 'accepted' | 'declined') {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active/memories/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memoryId, reviewState }),
      });
      if (!response.ok) {
        setError('Could not save that decision. Please try again.');
        return;
      }
      setRows((prev) =>
        prev.map((row) => (row.id === memoryId ? { ...row, reviewState } : row)),
      );
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <Card soft className="!p-7">
        <h3 className="serif text-[28px] m-0 mb-2">No contributor memories yet</h3>
        <p className="text-[color:var(--muted)] m-0">
          When loved ones upload through a private invitation, they appear here for your review.
        </p>
      </Card>
    );
  }

  return (
    <>
      {error ? (
        <p className="text-[14px] text-[color:var(--accent)] mb-4" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4">
        {rows.map((item) => (
          <Card key={item.id} className="!p-3 grid gap-4 md:grid-cols-[173px_1fr_auto] items-center">
            <div className="relative h-[106px] rounded-[10px] overflow-hidden">
              <Image src={item.imagePath} alt="" fill className="object-cover" sizes="173px" />
            </div>
            <div>
              <div className="text-[12px] text-[color:var(--muted)]">
                {item.contributorName ? `From ${item.contributorName}` : 'From a contributor'}
                {item.reviewState !== 'pending' ? ` · ${item.reviewState}` : ''}
              </div>
              <h3 className="serif text-[26px] m-0 mt-1">{item.title}</h3>
              {item.contributorNote ? (
                <p className="text-[14px] text-[color:var(--muted)] m-0 mt-2">{item.contributorNote}</p>
              ) : null}
              <p className="text-[12px] text-[color:var(--muted)] m-0 mt-1">{item.label}</p>
            </div>
            <div className="flex gap-3">
              {item.reviewState === 'pending' ? (
                <>
                  <Button onClick={() => review(item.id, 'accepted')} disabled={pending}>
                    Add to film
                  </Button>
                  <Button variant="secondary" onClick={() => review(item.id, 'declined')} disabled={pending}>
                    Keep aside
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled>
                  {item.reviewState === 'accepted' ? 'Accepted' : 'Set aside'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
