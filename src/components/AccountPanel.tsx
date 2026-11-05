'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button, Card, ErrorState } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

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

export function AccountPanel({
  initialTributes,
  locale = 'en',
}: {
  initialTributes: TributeRow[];
  locale?: LaunchLanguage;
}) {
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
        setError(creatorT(locale, 'creator.account.refreshFailed'));
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
        setError(creatorT(locale, 'creator.account.openFailed'));
        return;
      }
      setNote(creatorT(locale, 'creator.account.opened'));
      refreshList();
      router.refresh();
    });
  }

  function removeTribute(publicId: string, displayName: string) {
    if (
      !window.confirm(
        creatorT(locale, 'creator.account.confirmDelete').replace('{name}', displayName),
      )
    ) {
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
        setError(creatorT(locale, 'creator.account.deleteFailed'));
        return;
      }
      setNote(creatorT(locale, 'creator.account.deleted'));
      refreshList();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {rows.length === 0 ? (
        <Card soft className="!p-7">
          <p className="m-0 text-[color:var(--muted)]">{creatorT(locale, 'creator.account.empty')}</p>
          <div className="mt-4">
            <Button href="/setup">{creatorT(locale, 'creator.common.beginSetup')}</Button>
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
                  Updated {new Date(row.updatedAt).toLocaleString(locale)} · {row.publicId}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending || row.isActive} onClick={() => openTribute(row.publicId)}>
                {row.isActive
                  ? creatorT(locale, 'creator.account.active')
                  : creatorT(locale, 'creator.account.open')}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => removeTribute(row.publicId, row.displayName)}
              >
                {creatorT(locale, 'creator.account.delete')}
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
          body={creatorT(locale, 'creator.common.workSafe')}
          action={
            <Button variant="secondary" disabled={pending} onClick={refreshList}>
              {creatorT(locale, 'creator.common.retry')}
            </Button>
          }
        />
      ) : null}
      <p className="text-[12px] text-[color:var(--muted)] m-0">
        {creatorT(locale, 'creator.account.deletionNote')}
      </p>
    </div>
  );
}
