'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, ErrorState } from '@/components/ui';

type TributeRow = {
  publicId: string;
  displayName: string;
  updatedAt: string;
  memoryCount: number;
  entitlementActive: boolean;
  hasReadyFinal: boolean;
  readyJobId: string | null;
  hasPoster: boolean;
  isActive: boolean;
  firstFilmStage: string;
};

export function AccountPanel({ initialTributes }: { initialTributes: TributeRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialTributes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function refreshList() {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes');
      if (!response.ok) {
        setError('Could not refresh tributes.');
        return;
      }
      const body = (await response.json()) as { tributes: TributeRow[] };
      setRows(body.tributes);
    });
  }

  function openTribute(publicId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });
      if (!response.ok) {
        setError('Could not open that tribute.');
        return;
      }
      setNote('Active tribute updated.');
      refreshList();
      router.refresh();
    });
  }

  function removeTribute(publicId: string, displayName: string) {
    if (!window.confirm(`Permanently delete local tribute “${displayName}”? This cannot be undone.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicId }),
      });
      if (!response.ok) {
        setError('Could not delete that tribute.');
        return;
      }
      setNote('Tribute deleted from local storage.');
      refreshList();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {rows.length === 0 ? (
        <Card soft className="!p-7">
          <p className="m-0 text-[color:var(--muted)]">No tributes yet. Begin setup to create one.</p>
          <div className="mt-4">
            <Button href="/setup">Begin setup  ↗</Button>
          </div>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.publicId} className="!p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
              {row.hasPoster && row.readyJobId ? (
                <img
                  className="tribute-poster"
                  src={`/api/renders/poster?jobId=${row.readyJobId}`}
                  alt=""
                  width={160}
                  height={90}
                  data-testid="account-ready-poster"
                />
              ) : (
                <div
                  className="tribute-poster tribute-poster-fallback"
                  aria-hidden="true"
                  data-testid="account-ready-poster-fallback"
                />
              )}
              <div className="min-w-0">
                <div className="serif text-[28px] leading-none mb-2">{row.displayName}</div>
                <p className="text-[13px] text-[color:var(--muted)] m-0">
                  {row.memoryCount} memories · {row.firstFilmStage}
                  {row.entitlementActive ? ' · Memorial Pack' : ''}
                  {row.hasReadyFinal ? ' · READY final' : ''}
                  {row.hasReadyFinal && !row.hasPoster ? ' · poster pending' : ''}
                  {row.isActive ? ' · active' : ''}
                </p>
                <p className="text-[12px] text-[color:var(--muted)] m-0 mt-1">
                  Updated {new Date(row.updatedAt).toLocaleString()} · {row.publicId}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || row.isActive} onClick={() => openTribute(row.publicId)}>
                {row.isActive ? 'Active' : 'Open'}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => removeTribute(row.publicId, row.displayName)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))
      )}
      {note ? (
        <p className="text-[13px] m-0" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <ErrorState
          title={error}
          body="Your tribute work is still safe."
          action={
            <Button variant="secondary" disabled={pending} onClick={refreshList}>
              Retry
            </Button>
          }
        />
      ) : null}
      <p className="text-[12px] text-[color:var(--muted)] m-0">
        Deletion is local-store authoritative. Hosted account wipe needs Supabase (XB-012).
      </p>
    </div>
  );
}
