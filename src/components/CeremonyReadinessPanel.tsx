'use client';

import { useEffect, useState } from 'react';
import { Button, Card, ErrorState } from '@/components/ui';

type Finding = {
  id: string;
  code: string;
  severity: string;
  status: string;
  labelKey: string;
  detail?: string | null;
};

export function CeremonyReadinessPanel() {
  const [blocking, setBlocking] = useState<number | null>(null);
  const [warnings, setWarnings] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [packAllowed, setPackAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setError(null);
    setBlocking(null);
    void fetch('/api/ceremony-readiness')
      .then(async (r) => {
        const body = (await r.json()) as {
          blocking?: number;
          warnings?: number;
          findings?: Finding[];
          packAllowed?: boolean;
          error?: string;
        };
        if (!r.ok) {
          setError(body.error ?? 'unavailable');
          return;
        }
        setBlocking(body.blocking ?? 0);
        setWarnings(body.warnings ?? 0);
        setFindings(body.findings ?? []);
        setPackAllowed(Boolean(body.packAllowed));
      })
      .catch(() => setError('unavailable'));
  }, [tick]);

  return (
    <Card className="!p-6 mb-5">
      <h3 className="serif text-[28px] m-0 mb-2">Ceremony readiness</h3>
      <p className="text-[color:var(--muted)] mb-4">
        Deterministic checks compose Output QC. This is not a single score and does not invent moderation.
      </p>
      {error ? (
        <ErrorState
          title={error === 'unavailable' ? 'Ceremony readiness is temporarily unavailable.' : error}
          body="Your tribute work is still safe."
          action={
            <Button variant="secondary" onClick={() => setTick((n) => n + 1)}>
              Retry readiness check
            </Button>
          }
        />
      ) : blocking === null ? (
        <p className="text-[13px] text-[color:var(--muted)] m-0">Checking readiness…</p>
      ) : (
        <>
          <p className="text-[14px] m-0 mb-3">
            {blocking} blocking · {warnings} warnings
            {packAllowed === false ? ' · Ceremony Pack blocked' : packAllowed ? ' · Pack allowed' : ''}
          </p>
          <ul className="list-none p-0 m-0 grid gap-2 text-[13px] text-[color:var(--muted)]">
            {findings.slice(0, 8).map((f) => (
              <li key={f.id}>
                <strong>{f.severity}</strong> · {f.code}
                {f.detail ? ` · ${f.detail}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
