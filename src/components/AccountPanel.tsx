'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
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
  const [confirmFor, setConfirmFor] = useState<{ publicId: string; displayName: string } | null>(
    null,
  );
  const [typed, setTyped] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmFor && !dialog.open) dialog.showModal();
    if (!confirmFor && dialog.open) dialog.close();
  }, [confirmFor]);

  function closeConfirm() {
    setConfirmFor(null);
    setTyped('');
  }

  const nameMatches =
    confirmFor !== null &&
    typed.trim().toLocaleLowerCase(locale) === confirmFor.displayName.trim().toLocaleLowerCase(locale);

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

  function removeTribute(publicId: string) {
    closeConfirm();
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
                <p className="text-[14px] text-[color:var(--muted)] m-0">
                  {[
                    `${row.memoryCount} ${creatorT(locale, 'creator.nav.memories').toLocaleLowerCase(locale)}`,
                    row.entitlementActive ? creatorT(locale, 'creator.pack.fallbackName') : null,
                    row.isActive ? creatorT(locale, 'creator.account.active').toLocaleLowerCase(locale) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-[12px] text-[color:var(--muted)] m-0 mt-1">
                  {new Date(row.updatedAt).toLocaleString(locale)}
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
                onClick={() => {
                  setTyped('');
                  setConfirmFor({ publicId: row.publicId, displayName: row.displayName });
                }}
              >
                {creatorT(locale, 'creator.account.delete')}
              </Button>
            </div>
          </Card>
        ))
      )}
      <dialog
        ref={dialogRef}
        onClose={() => {
          setConfirmFor(null);
          setTyped('');
        }}
        aria-labelledby="delete-tribute-title"
        className="rounded-2xl border border-[color:var(--border)] p-6 max-w-[480px] w-[calc(100%-2rem)]"
        data-testid="delete-tribute-dialog"
      >
        {confirmFor ? (
          <form
            method="dialog"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (nameMatches) removeTribute(confirmFor.publicId);
            }}
          >
            <h2 id="delete-tribute-title" className="serif text-[24px] m-0">
              {creatorT(locale, 'creator.account.deleteTitle')}
            </h2>
            <p className="m-0 text-[15px]">
              {creatorT(locale, 'creator.account.deleteBody').replace('{name}', confirmFor.displayName)}
            </p>
            <label className="grid gap-1 text-[14px]">
              {creatorT(locale, 'creator.account.deleteTypeLabel')}
              <input
                className="rounded-lg border border-[color:var(--border)] px-3 py-2 text-[16px]"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoFocus
                placeholder={confirmFor.displayName}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" type="button" onClick={closeConfirm}>
                {creatorT(locale, 'creator.account.deleteCancel')}
              </Button>
              <Button type="submit" disabled={!nameMatches || pending}>
                {creatorT(locale, 'creator.account.deleteConfirm')}
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>
      {note ? (
        <p className="text-[14px] m-0" role="status">
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
