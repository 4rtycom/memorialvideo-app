'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

type InviteSummary = {
  id: string;
  scope: string;
  expiresAt: string;
  useCount: number;
  maxUses: number | null;
  revoked: boolean;
  usable: boolean;
  status?: 'active' | 'revoked' | 'expired' | 'max_uses';
};

type CollectionStatus = 'NOT_STARTED' | 'OPEN' | 'LOCKED';

function inviteStatusLabel(invite: InviteSummary): string {
  if (invite.status === 'revoked' || invite.revoked) return 'Revoked';
  if (invite.status === 'expired') return 'Expired';
  if (invite.status === 'max_uses') return 'Max uses reached';
  if (!invite.usable) {
    if (Date.parse(invite.expiresAt) <= Date.now()) return 'Expired';
    if (invite.maxUses != null && invite.useCount >= invite.maxUses) return 'Max uses reached';
    return 'Expired';
  }
  return 'Active';
}

type Progress = {
  photoCount: number;
  contributorPhotoCount: number;
  inviteUseCount: number;
};

export function InvitePanel({
  initialInvites,
  initialProgress,
  initialCollectionStatus,
  previewName,
  locale = 'en',
}: {
  initialInvites: InviteSummary[];
  initialProgress: Progress;
  initialCollectionStatus: CollectionStatus;
  previewName: string;
  locale?: LaunchLanguage;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [invites, setInvites] = useState(initialInvites);
  const [progress, setProgress] = useState(initialProgress);
  const [collectionStatus, setCollectionStatus] = useState(initialCollectionStatus);
  const [actionUrl, setActionUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const collectionLocked = collectionStatus === 'LOCKED';

  function createInvite() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const response = await fetch('/api/invites', { method: 'POST' });
      if (!response.ok) {
        setError(
          response.status === 503
            ? 'Invite hashing is unavailable (missing SHARE_TOKEN_PEPPER outside local).'
            : 'We could not create an invitation. Please try again.',
        );
        return;
      }
      const body = (await response.json()) as {
        actionUrl: string;
        summary: InviteSummary;
      };
      setActionUrl(body.actionUrl);
      setInvites((prev) => [body.summary, ...prev]);
      const listed = await fetch('/api/invites');
      if (listed.ok) {
        const data = (await listed.json()) as {
          invites: InviteSummary[];
          progress: Progress;
          collectionStatus?: CollectionStatus;
        };
        setInvites(data.invites);
        setProgress(data.progress);
        if (data.collectionStatus) setCollectionStatus(data.collectionStatus);
      }
      router.refresh();
    });
  }

  function setCollection(action: 'open' | 'lock') {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        setError(creatorT(locale, 'creator.collection.error'));
        return;
      }
      const body = (await response.json()) as { collectionStatus: CollectionStatus };
      setCollectionStatus(body.collectionStatus);
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

  function revoke(inviteId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/invites/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      if (!response.ok) {
        setError('Could not revoke that invitation.');
        return;
      }
      setInvites((prev) =>
        prev.map((invite) =>
          invite.id === inviteId
            ? { ...invite, revoked: true, usable: false, status: 'revoked' }
            : invite,
        ),
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="card !p-8">
        <h2 className="serif text-[35px] m-0 mb-3">Share a private invitation</h2>
        <p className="text-[color:var(--muted)] mb-6">
          Anyone you invite can open the link and add memories — no account needed. Only a hash of
          the token is stored.
        </p>
        <div className="flex gap-2 mb-4">
          <div className="field flex items-center flex-1 !min-h-[61px] text-[14px] overflow-hidden">
            <span className="truncate">
              {actionUrl ?? 'Create an invitation to reveal a one-time private link'}
            </span>
          </div>
          <Button onClick={copyLink} disabled={!actionUrl || pending}>
            {copied ? 'Copied' : 'Copy  ↗'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <Button onClick={createInvite} disabled={pending}>
            {pending ? 'Working…' : 'Create invitation  ↗'}
          </Button>
          {collectionLocked ? (
            <Button
              variant="secondary"
              onClick={() => setCollection('open')}
              disabled={pending}
              data-testid="collection-open"
            >
              {creatorT(locale, 'creator.collection.open')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setCollection('lock')}
              disabled={pending || collectionStatus === 'NOT_STARTED'}
              data-testid="collection-lock"
            >
              {creatorT(locale, 'creator.collection.lock')}
            </Button>
          )}
        </div>
        <p
          className="text-[13px] text-[color:var(--muted)] mb-4"
          data-testid="collection-status"
          role="status"
        >
          {collectionLocked
            ? creatorT(locale, 'creator.collection.statusLocked')
            : collectionStatus === 'OPEN'
              ? creatorT(locale, 'creator.collection.statusOpen')
              : creatorT(locale, 'creator.collection.statusNotStarted')}
        </p>
        {error ? (
          <p className="text-[14px] text-[color:var(--accent)] mb-4" role="alert">
            {error}
          </p>
        ) : null}
        <p className="text-[13px] text-[color:var(--muted)] mb-4">
          Collected {progress.photoCount} memories · {progress.contributorPhotoCount} from loved ones
          · {progress.inviteUseCount} invite uses
        </p>
        {invites.length > 0 ? (
          <ul className="list-none p-0 m-0 grid gap-3">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="border-t border-[color:var(--border)] pt-3 flex flex-wrap items-center justify-between gap-3 text-[14px]"
              >
                <span className="text-[color:var(--muted)]">
                  {inviteStatusLabel(invite)} · {invite.useCount}
                  {invite.maxUses != null ? `/${invite.maxUses}` : ''} uses · expires{' '}
                  {invite.expiresAt.slice(0, 10)}
                </span>
                {invite.usable ? (
                  <Button variant="secondary" onClick={() => revoke(invite.id)} disabled={pending}>
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-t border-[color:var(--border)] pt-5 mt-6 text-[14px] text-[color:var(--muted)]">
          ♧  Only people with this invitation can contribute.
        </div>
      </div>
      <div className="card soft !p-6">
        <h3 className="serif text-[30px] m-0 mb-4">What guests will see</h3>
        <div className="bg-[color:var(--primary)] text-white rounded-[9px] px-4 py-4">
          <div className="serif text-[26px]">{previewName}</div>
          <p className="text-[13px] text-[color:var(--cinema-soft)] m-0 mt-1">Private contribution</p>
        </div>
        <p className="text-[color:var(--muted)] mt-5 mb-2">Upload pictures and videos in a few taps.</p>
        <p className="text-[12px] text-[color:var(--muted)] m-0">No sign-up · Your memories are private</p>
      </div>
    </div>
  );
}
