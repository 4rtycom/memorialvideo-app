'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

type DownloadPlan = {
  canDownloadMp4: boolean;
  canExportMetadata: boolean;
  reason: string;
  staleFinal?: boolean;
  isCurrent?: boolean | null;
  readyJobId?: string | null;
  hasPoster?: boolean;
};

type ShareRow = {
  id: string;
  scope: string;
  expiresAt: string;
  revoked: boolean;
  usable: boolean;
  status?: 'active' | 'revoked' | 'expired';
};

type CeremonyPackPlan = {
  canBuild: boolean;
  reason: string;
};

export function ShareDownloadPanel({
  entitlementActive,
  download,
  ceremonyPack,
  initialShares,
  watchPathPlaceholder,
  locale = 'en',
}: {
  entitlementActive: boolean;
  download: DownloadPlan;
  ceremonyPack: CeremonyPackPlan;
  initialShares: ShareRow[];
  watchPathPlaceholder: string;
  locale?: LaunchLanguage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shares, setShares] = useState(initialShares);
  const [actionUrl, setActionUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function createShare() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const response = await fetch('/api/shares', { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(
          body.error === 'no_entitlement'
            ? 'Memorial Pack is required for private viewing links.'
            : body.error === 'no_timeline'
              ? 'Publish a first film (TimelineContract) before sharing a private screening.'
              : 'Could not create a private link.',
        );
        return;
      }
      const body = (await response.json()) as {
        actionUrl: string;
        shareId: string;
        expiresAt: string;
        scope: string;
        note: string;
      };
      setActionUrl(body.actionUrl);
      setNote(body.note);
      setShares((prev) => [
        {
          id: body.shareId,
          scope: body.scope,
          expiresAt: body.expiresAt,
          revoked: false,
          usable: true,
          status: 'active',
        },
        ...prev,
      ]);
      router.refresh();
    });
  }

  async function copyLink() {
    if (!actionUrl) return;
    try {
      await navigator.clipboard.writeText(actionUrl);
      setCopied(true);
    } catch {
      setError('Could not copy — select the link and copy manually.');
    }
  }

  function revoke(shareId: string) {
    startTransition(async () => {
      const response = await fetch('/api/shares', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', shareId }),
      });
      if (!response.ok) {
        setError('Could not revoke that link.');
        return;
      }
      setShares((prev) =>
        prev.map((share) =>
          share.id === shareId
            ? { ...share, revoked: true, usable: false, status: 'revoked' }
            : share,
        ),
      );
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card !p-4">
        {download.hasPoster && download.readyJobId ? (
          <img
            className="tribute-poster tribute-poster-share"
            src={`/api/renders/poster?jobId=${download.readyJobId}`}
            alt=""
            width={640}
            height={360}
            data-testid="share-ready-poster"
          />
        ) : (
          <div className="bg-[color:var(--primary)] text-white rounded-[8px] px-5 py-5">
            <div className="serif text-[37px] leading-none">A life beautifully lived</div>
          </div>
        )}
        <p className="text-[14px] text-[color:var(--muted)] mt-5 mb-5">
          Film ready · Widescreen 16:9 · 1080p when verified
        </p>
        {download.canDownloadMp4 ? (
          <a className="btn btn-primary btn-block" href="/api/renders/download">
            ↓  {creatorT(locale, 'creator.share.downloadMp4')}
          </a>
        ) : (
          <Button className="btn-block opacity-60" disabled>
            ↓  {creatorT(locale, 'creator.share.downloadMp4')}
          </Button>
        )}
        <p className="text-[12px] text-[color:var(--muted)] mt-3 mb-0">{download.reason}</p>
        {download.staleFinal ? (
          <p
            className="text-[13px] text-[color:var(--accent)] mt-2 mb-0"
            data-testid="ceremony-render-stale"
            role="status"
          >
            {creatorT(locale, 'creator.share.renderStale')}
          </p>
        ) : null}
        {entitlementActive && download.canExportMetadata ? (
          <p className="text-[12px] text-[color:var(--muted)] mt-2 mb-0">
            <a href="/api/renders/export-metadata">{creatorT(locale, 'creator.share.metadataExport')}</a>
          </p>
        ) : null}
        <div className="border-t border-[color:var(--border)] mt-5 pt-5">
          <h3 className="serif text-[23px] m-0 mb-2">{creatorT(locale, 'creator.share.ceremonyPack')}</h3>
          <p className="text-[13px] text-[color:var(--muted)] mb-3">
            {ceremonyPack.canBuild
              ? creatorT(locale, 'creator.share.ceremonyPackReady')
              : creatorT(locale, 'creator.share.ceremonyPackBlocked')}
          </p>
          {ceremonyPack.canBuild ? (
            <a className="btn btn-secondary btn-block" href="/api/ceremony-pack">
              {creatorT(locale, 'creator.share.ceremonyPackDownload')}  ↓
            </a>
          ) : (
            <Button className="btn-block opacity-60" disabled>
              {creatorT(locale, 'creator.share.ceremonyPackDownload')}  ↓
            </Button>
          )}
        </div>
      </div>
      <div className="card !p-7">
        <h2 className="serif text-[34px] m-0 mb-3">{creatorT(locale, 'creator.share.privateTitle')}</h2>
        <p className="text-[color:var(--muted)] mb-5">{creatorT(locale, 'creator.share.privateBody')}</p>
        <div className="field flex items-center mb-4 text-[14px] overflow-hidden">
          <span className="truncate">{actionUrl ?? watchPathPlaceholder}</span>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <Button onClick={createShare} disabled={pending || !entitlementActive}>
            {pending ? 'Working…' : `${creatorT(locale, 'creator.share.createLink')}  ↗`}
          </Button>
          <Button variant="secondary" onClick={copyLink} disabled={!actionUrl}>
            {copied ? creatorT(locale, 'creator.share.copied') : `${creatorT(locale, 'creator.share.copy')}  ↗`}
          </Button>
        </div>
        {note ? <p className="text-[12px] text-[color:var(--muted)] mb-3">{note}</p> : null}
        {error ? (
          <p className="text-[14px] text-[color:var(--accent)] mb-3" role="alert">
            {error}
          </p>
        ) : null}
        {shares.length > 0 ? (
          <ul className="list-none p-0 m-0 grid gap-2 text-[13px] text-[color:var(--muted)] mb-4">
            {shares.map((share) => (
              <li key={share.id} className="flex justify-between gap-3 items-center">
                <span>
                  {share.status === 'revoked' || share.revoked
                    ? creatorT(locale, 'creator.share.statusRevoked')
                    : share.status === 'expired' || !share.usable
                      ? creatorT(locale, 'creator.share.statusExpired')
                      : creatorT(locale, 'creator.share.statusActive')}{' '}
                  · {share.expiresAt.slice(0, 10)}
                </span>
                {share.usable ? (
                  <Button variant="ghost" onClick={() => revoke(share.id)} disabled={pending}>
                    {creatorT(locale, 'creator.share.revoke')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-t border-[color:var(--border)] pt-5">
          <h3 className="serif text-[23px] m-0 mb-4">Before the ceremony</h3>
          <ul className="list-none p-0 m-0 grid gap-2 text-[14px] text-[color:var(--muted)]">
            <li>✓  Private link for family screening</li>
            <li>✓  Test playback with the venue</li>
            <li>✓  Confirm the soundtrack is cleared for use</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
