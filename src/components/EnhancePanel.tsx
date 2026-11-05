'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

type Memory = {
  id: string;
  title: string;
  imagePath: string;
};

type Request = {
  id: string;
  memoryId: string;
  status: string;
  note: string;
  variantPath?: string | null;
  approvedForFilm?: boolean;
};

function statusLabel(status: string): string {
  switch (status) {
    case 'queued':
      return 'Waiting';
    case 'processing':
      return 'Preparing local improvement…';
    case 'ready_local':
      return 'Local improvement ready';
    case 'unavailable':
      return 'Local improvement unavailable — original kept';
    case 'rejected':
      return 'Discarded — original kept';
    default:
      return status;
  }
}

export function EnhancePanel({
  memories,
  consentLocal,
  requests,
  hasTimeline,
}: {
  memories: Memory[];
  consentLocal: boolean;
  requests: Request[];
  hasTimeline: boolean;
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(consentLocal);
  const [rows, setRows] = useState(requests);
  const [selectedId, setSelectedId] = useState(memories[0]?.id ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<'before' | 'after'>('after');
  const selected = memories.find((m) => m.id === selectedId) ?? memories[0];
  const readyVariant = rows.find(
    (r) => r.memoryId === selected?.id && r.status === 'ready_local' && r.id,
  );
  const selectedRows = rows.filter((r) => r.memoryId === selected?.id);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'o' || event.key === 'O' || event.key === 'ArrowLeft') {
        setCompareMode('before');
      }
      if (event.key === 'v' || event.key === 'V' || event.key === 'ArrowRight') {
        setCompareMode('after');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function upsertRequest(next: Request) {
    setRows((prev) => {
      const without = prev.filter((r) => r.id !== next.id);
      return [next, ...without];
    });
  }

  function post(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/enhancement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        note?: string;
        request?: Request;
        advanced?: Request;
        consentLocal?: boolean;
        scenesUpdated?: number;
        filmSrc?: string;
        filmReverted?: boolean;
        generative?: boolean;
      };
      if (!response.ok) {
        setError(
          payload.error === 'no_consent'
            ? 'Grant local enhancement consent first.'
            : payload.error === 'no_timeline' || payload.error === 'asset_not_in_timeline'
              ? 'Arrange the first film before using an improved photograph in the film.'
              : payload.error === 'not_ready'
                ? 'Wait until local improvement is ready before using it in the film.'
                : payload.error === 'not_bound'
                  ? 'This improvement is not currently used in the film.'
                  : 'Could not update enhancement.',
        );
        return;
      }
      if (typeof payload.consentLocal === 'boolean') {
        setConsent(payload.consentLocal);
      }
      if (payload.request) {
        upsertRequest(payload.request);
      }
      if (payload.advanced) {
        upsertRequest(payload.advanced);
      }
      if (body.action === 'request') {
        setCompareMode('after');
        setInfo(
          payload.request?.status === 'ready_local'
            ? 'Local improvement ready. Compare before and after, then decide.'
            : payload.note ??
                'Local improvement could not finish. The original photograph is unchanged.',
        );
      }
      if (body.action === 'use_in_film') {
        setInfo(
          payload.note ??
            `Improved photograph bound into the film${
              typeof payload.scenesUpdated === 'number'
                ? ` (${payload.scenesUpdated} scene${payload.scenesUpdated === 1 ? '' : 's'})`
                : ''
            }. Local pixel correction only — generative restoration is not available.`,
        );
      }
      if (body.action === 'revert_film') {
        setInfo(payload.note ?? 'Original photograph restored in the film.');
      }
      if (body.action === 'reject') {
        setInfo(
          payload.note ??
            `Improvement discarded${payload.filmReverted ? ' and removed from the film' : ''}. Original kept.`,
        );
      }
      if (payload.generative === true) {
        setError('Unexpected generative claim blocked. Only local improvement is offered.');
      }
      router.refresh();
    });
  }

  if (!selected) {
    return (
      <Card soft className="!p-7">
        <p className="m-0 text-[color:var(--muted)]">
          Add ready photographs before requesting gentle local improvement. Generative reconstruction
          is not available.
        </p>
      </Card>
    );
  }

  const afterReady = Boolean(readyVariant);

  return (
    <>
      <Card className="!p-5 mb-5" data-testid="enhance-capability">
        <div className="text-[11px] font-bold tracking-[0.08em] text-[color:var(--accent)] mb-2">
          WHAT THIS DOES
        </div>
        <p className="m-0 text-[14px] text-[color:var(--ink)]">
          Available now: local, reversible photograph correction (contrast, warmth, gentle sharpen).
        </p>
        <p className="mt-2 mb-0 text-[13px] text-[color:var(--muted)]">
          Not available: generative restoration, invented detail, face synthesis, or video
          post-processing. Those stay off — we will not present them as ready.
        </p>
      </Card>

      <Card className="!p-5 mb-5">
        <label className="flex items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={consent}
            disabled={pending}
            onChange={(e) => post({ action: 'consent', granted: e.target.checked })}
          />
          <span>
            Allow local, reversible photo improvement on this tribute. Film styles already apply a
            presentation look in preview/render — this only creates a separate library variant you can
            compare and reject. Originals are never overwritten.
          </span>
        </label>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-[color:var(--accent)]">
            BEFORE / AFTER
          </div>
          <p className="m-0 mt-1 text-[13px] text-[color:var(--muted)]">
            Side-by-side compare, or toggle with Before/After (keys O / V or arrow keys).
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Before and after compare">
          <Button
            variant={compareMode === 'before' ? 'primary' : 'secondary'}
            onClick={() => setCompareMode('before')}
          >
            Before (original)
          </Button>
          <Button
            variant={compareMode === 'after' ? 'primary' : 'secondary'}
            disabled={!afterReady}
            onClick={() => setCompareMode('after')}
          >
            After (local)
          </Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 mb-5">
        <Card className="!p-4" data-testid="enhance-before">
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">
            BEFORE · ORIGINAL (IMMUTABLE)
          </div>
          <div
            className={`relative h-[280px] rounded-[10px] overflow-hidden ${
              compareMode === 'before' ? 'ring-2 ring-[color:var(--accent)]' : ''
            }`}
          >
            <Image src={selected.imagePath} alt="" fill className="object-cover" sizes="480px" />
          </div>
          <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">{selected.title}</p>
        </Card>
        <Card className="!p-4" data-testid="enhance-after">
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">
            AFTER · LOCAL PIXEL CORRECTION
          </div>
          {readyVariant ? (
            <div
              className={`relative h-[280px] rounded-[10px] overflow-hidden ${
                compareMode === 'after' ? 'ring-2 ring-[color:var(--accent)]' : ''
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic local variant route */}
              <img
                src={`/api/enhancement/variant/${readyVariant.id}`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="relative h-[280px] rounded-[10px] overflow-hidden bg-[color:var(--bg)] grid place-items-center px-6 text-center text-[color:var(--muted)]">
              No improved variant yet. We never invent a generative before/after.
            </div>
          )}
          <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">
            Method: deterministic local correction — no synthesised detail
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {memories.slice(0, 8).map((m) => (
          <Button
            key={m.id}
            variant={m.id === selected.id ? 'primary' : 'secondary'}
            onClick={() => {
              setSelectedId(m.id);
              setCompareMode('after');
            }}
          >
            {m.title.slice(0, 24)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3" data-testid="enhance-family-actions">
        <Button
          disabled={pending || !consent}
          onClick={() => post({ action: 'request', memoryId: selected.id })}
        >
          Prepare local improvement
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !readyVariant || !hasTimeline}
          onClick={() =>
            readyVariant ? post({ action: 'use_in_film', requestId: readyVariant.id }) : undefined
          }
        >
          {readyVariant?.approvedForFilm ? 'Update film with improvement' : 'Approve for film'}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !readyVariant?.approvedForFilm}
          onClick={() =>
            readyVariant ? post({ action: 'revert_film', requestId: readyVariant.id }) : undefined
          }
        >
          Revert film to original
        </Button>
        <Button
          variant="ghost"
          disabled={pending || !readyVariant}
          onClick={() =>
            readyVariant ? post({ action: 'reject', requestId: readyVariant.id }) : undefined
          }
        >
          Discard improvement
        </Button>
        <Button href="/memories" variant="ghost">
          Back to memories
        </Button>
      </div>
      <p className="text-[13px] text-[color:var(--muted)] mt-4">
        Family sign-off is required before a local improvement enters the film. You can reverse that
        binding at any time. Originals stay in the library.
      </p>
      {info ? (
        <p className="text-[13px] mt-2" role="status">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="text-[13px] text-[color:var(--accent)] mt-2" role="alert">
          {error}
        </p>
      ) : null}
      {selectedRows.length > 0 ? (
        <ul className="list-none p-0 mt-4 grid gap-2 text-[13px] text-[color:var(--muted)]">
          {selectedRows.slice(0, 8).map((r) => (
            <li key={r.id} data-testid={`enhance-status-${r.status}`}>
              {statusLabel(r.status)}
              {r.approvedForFilm ? ' · in film' : ''}
              {r.note ? ` · ${r.note}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
