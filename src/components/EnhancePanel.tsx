'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
  const selected = memories.find((m) => m.id === selectedId) ?? memories[0];
  const readyVariant = rows.find(
    (r) => r.memoryId === selected?.id && r.status === 'ready_local' && r.id,
  );

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
      };
      if (!response.ok) {
        setError(
          payload.error === 'no_consent'
            ? 'Grant local enhancement consent first.'
            : payload.error === 'no_timeline' || payload.error === 'asset_not_in_timeline'
              ? 'Arrange the first film before using an improved photograph in the film.'
              : payload.error === 'not_ready'
                ? 'Wait until local improvement is ready before using it in the film.'
                : 'Could not update enhancement.',
        );
        return;
      }
      if (typeof payload.consentLocal === 'boolean') {
        setConsent(payload.consentLocal);
      }
      if (payload.request && body.action === 'request') {
        setRows((prev) => [payload.request!, ...prev]);
      } else if (payload.request) {
        setRows((prev) =>
          prev.map((r) => (r.id === payload.request!.id ? payload.request! : r)),
        );
      }
      if (payload.advanced) {
        setRows((prev) =>
          prev.map((r) => (r.id === payload.advanced!.id ? payload.advanced! : r)),
        );
        setInfo(payload.note ?? null);
      }
      if (body.action === 'use_in_film') {
        setInfo(
          payload.note ??
            `Improved photograph bound into the film${
              typeof payload.scenesUpdated === 'number' ? ` (${payload.scenesUpdated} scene${payload.scenesUpdated === 1 ? '' : 's'})` : ''
            }. Local pixel-ops only — generative Finish is not complete.`,
        );
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

  return (
    <>
      <Card className="!p-5 mb-5">
        <label className="flex items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={consent}
            disabled={pending}
            onChange={(e) => post({ action: 'consent', granted: e.target.checked })}
          />
          <span>
            Allow local, reversible photo improvement on this tribute. External/model enhancement stays
            off. Originals are never overwritten.
          </span>
        </label>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 mb-5">
        <Card className="!p-4">
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">ORIGINAL (IMMUTABLE)</div>
          <div className="relative h-[280px] rounded-[10px] overflow-hidden">
            <Image src={selected.imagePath} alt="" fill className="object-cover" sizes="480px" />
          </div>
          <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">{selected.title}</p>
        </Card>
        <Card className="!p-4">
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">
            IMPROVED (LOCAL PIXEL OPS)
          </div>
          {readyVariant ? (
            <div className="relative h-[280px] rounded-[10px] overflow-hidden">
              <img
                src={`/api/enhancement/variant/${readyVariant.id}`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="relative h-[280px] rounded-[10px] overflow-hidden bg-[color:var(--bg)] grid place-items-center px-6 text-center text-[color:var(--muted)]">
              No improved variant until local pixel-ops completes. Generative before/after is never
              invented.
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {memories.slice(0, 8).map((m) => (
          <Button
            key={m.id}
            variant={m.id === selected.id ? 'primary' : 'secondary'}
            onClick={() => setSelectedId(m.id)}
          >
            {m.title.slice(0, 24)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || !consent}
          onClick={() => post({ action: 'request', memoryId: selected.id })}
        >
          Request local improvement
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => post({ action: 'advance' })}>
          Advance enhancement job
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !readyVariant || !hasTimeline}
          onClick={() =>
            readyVariant
              ? post({ action: 'use_in_film', requestId: readyVariant.id })
              : undefined
          }
        >
          {readyVariant?.approvedForFilm ? 'Update film with improvement' : 'Use in film'}
        </Button>
        <Button href="/memories" variant="ghost">
          Back to memories
        </Button>
      </div>
      <p className="text-[13px] text-[color:var(--muted)] mt-4">
        No generative reconstruction or face synthesis. Local pixel-ops may bind into the film after
        family approval; generative Finish / AI enhancement is not COMPLETE.
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
      {rows.length > 0 ? (
        <ul className="list-none p-0 mt-4 grid gap-2 text-[13px] text-[color:var(--muted)]">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              {r.status}
              {r.approvedForFilm ? ' · in film' : ''} · {r.note || r.memoryId}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
