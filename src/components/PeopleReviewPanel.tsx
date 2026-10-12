'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button, Card, ErrorState } from '@/components/ui';

type Overview = {
  consent: { state: string; localApproved: boolean; version: number };
  processingAllowed: boolean;
  detectionEngine: { available: false; status: string; note: string };
  profiles: Array<{
    id: string;
    displayLabel: string;
    approvedForStory: boolean;
    approvedForFilm: boolean;
  }>;
  clusters: unknown[];
  observations: unknown[];
};

export function PeopleReviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [status, setStatus] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [pending, startTransition] = useTransition();

  function reload() {
    setLoadState('loading');
    void fetch('/api/people')
      .then(async (r) => {
        if (!r.ok) {
          setLoadState('failed');
          return;
        }
        setData((await r.json()) as Overview);
        setLoadState('ready');
      })
      .catch(() => setLoadState('failed'));
  }

  useEffect(() => {
    reload();
  }, []);

  function post(body: Record<string, unknown>, okMessage: string) {
    setStatus(null);
    startTransition(async () => {
      const response = await fetch('/api/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        setStatus(
          err.error === 'consent_required'
            ? 'Grant local People consent before adding labels.'
            : 'Could not save People settings.',
        );
        return;
      }
      setData((await response.json()) as Overview);
      setStatus(okMessage);
      setLoadState('ready');
    });
  }

  return (
    <Card className="!p-7 mt-5" data-testid="people-review-panel">
      <h2 className="serif text-[30px] m-0 mb-2">People in this tribute</h2>
      <p className="text-[color:var(--muted)] mb-3">
        Consent-gated family labels only. Face detection and embeddings are not COMPLETE in this
        creator host.
      </p>

      {loadState === 'loading' ? (
        <p className="text-[13px] text-[color:var(--muted)]">Loading People…</p>
      ) : null}
      {loadState === 'failed' ? (
        <ErrorState
          title="Could not load People."
          body="Your tribute work is still safe."
          action={
            <Button variant="secondary" onClick={reload}>
              Retry
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          <p className="text-[14px] mb-2">
            Consent: <strong>{data.consent.state}</strong>
            {data.consent.localApproved ? ' · local approved' : ' · local off'}
          </p>
          <p className="text-[12px] text-[color:var(--muted)] mb-4">{data.detectionEngine.note}</p>
          <div className="flex flex-wrap gap-3 mb-5">
            {!data.consent.localApproved ? (
              <Button
                disabled={pending}
                onClick={() =>
                  post(
                    { action: 'grant_local', expectedVersion: data.consent.version },
                    'Local People consent granted.',
                  )
                }
              >
                Grant local consent
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => post({ action: 'revoke' }, 'People consent revoked.')}
                >
                  Revoke
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    post({ action: 'delete_derived' }, 'Derived people data cleared (none wired).')
                  }
                >
                  Delete derived
                </Button>
              </>
            )}
          </div>

          <h3 className="serif text-[22px] m-0 mb-2">Family labels</h3>
          <p className="text-[13px] text-[color:var(--muted)] mb-3">
            Manual labels only — not inferred faces. Groups/observations stay empty until a real
            detector is wired (legal XB-010).
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              className="field flex-1 min-w-[180px]"
              value={label}
              maxLength={80}
              placeholder="e.g. Aunt Maria"
              onChange={(e) => setLabel(e.target.value)}
              disabled={!data.processingAllowed || pending}
            />
            <Button
              disabled={!data.processingAllowed || pending || label.trim().length < 1}
              onClick={() => {
                post(
                  {
                    action: 'add_label',
                    displayLabel: label.trim(),
                    approvedForStory: true,
                    approvedForFilm: false,
                  },
                  'Label saved.',
                );
                setLabel('');
              }}
            >
              Add label
            </Button>
          </div>
          {data.profiles.length === 0 ? (
            <p className="text-[13px] text-[color:var(--muted)] m-0">No family labels yet.</p>
          ) : (
            <ul className="list-none p-0 m-0 grid gap-2 text-[14px]">
              {data.profiles.map((p) => (
                <li key={p.id} className="text-[color:var(--muted)]">
                  {p.displayLabel}
                  {p.approvedForStory ? ' · story' : ''}
                  {p.approvedForFilm ? ' · film' : ''}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[12px] text-[color:var(--muted)] mt-4 mb-0">
            Clusters: {data.clusters.length} · Observations: {data.observations.length} · Detection
            not COMPLETE
          </p>
        </>
      ) : null}
      {status ? (
        <p className="text-[13px] text-[color:var(--primary)] mt-3 mb-0" role="status">
          {status}
        </p>
      ) : null}
    </Card>
  );
}
