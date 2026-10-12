'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';

type Overview = {
  hasTimeline: boolean;
  currentAspect: string | null;
  width: number | null;
  height: number | null;
  pending: boolean;
  pendingKind: string | null;
  pendingAspect: string | null;
  kinds: string[];
  aspects: string[];
  faceAwareReframe: { available: false; note: string };
  note: string;
};

const KIND_LABELS: Record<string, string> = {
  full: 'Full ceremony',
  ceremony_short: 'Short ceremony cut',
  vertical: 'Vertical (9:16)',
  square: 'Square (1:1)',
  silent_captioned: 'Silent + captions',
  social_short: 'Social short',
};

export function GuidedVariantsPanel() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState('vertical');
  const [aspect, setAspect] = useState('9:16');

  function reload() {
    void fetch('/api/output-variants')
      .then(async (r) => {
        if (!r.ok) {
          setError('Could not load Guided Variants.');
          return;
        }
        const body = (await r.json()) as Overview;
        setOverview(body);
        setError(null);
      })
      .catch(() => setError('Could not load Guided Variants.'));
  }

  useEffect(() => {
    reload();
  }, []);

  function onKindChange(next: string) {
    setKind(next);
    if (next === 'vertical') {
      setAspect('9:16');
    } else if (next === 'square') {
      setAspect('1:1');
    } else {
      setAspect('16:9');
    }
  }

  function run(action: string, okMessage: string, extra: Record<string, unknown> = {}) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/output-variants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        afterAspect?: string;
        width?: number;
        height?: number;
      };
      if (!response.ok) {
        setError(
          body.error === 'needs_timeline'
            ? 'Arrange a first film before Guided Variants.'
            : body.error === 'needs_propose'
              ? 'Propose a variant before preview or apply.'
              : body.error === 'stale_base'
                ? 'Timeline changed since the proposal. Propose again.'
                : body.error === 'nothing_to_revert'
                  ? 'Nothing to revert yet.'
                  : 'Guided Variants action failed.',
        );
        reload();
        return;
      }
      const dims =
        typeof body.width === 'number' && typeof body.height === 'number'
          ? ` · ${body.width}×${body.height}`
          : '';
      const aspectLabel = body.afterAspect ? ` · ${body.afterAspect}` : '';
      setStatus(`${okMessage}${aspectLabel}${dims}`);
      reload();
      router.refresh();
    });
  }

  return (
    <Card className="!p-7 mt-5" data-testid="guided-variants-panel">
      <h2 className="serif text-[30px] m-0 mb-2">Guided Variants</h2>
      <p className="text-[color:var(--muted)] mb-3">
        Propose a delivery shape from the same TimelineContract — vertical, square, or short cut —
        then preview, apply, or revert. One project; no forked tributes.
      </p>
      <p className="text-[12px] text-[color:var(--accent)] mb-4">
        Face-aware reframe deferred (not COMPLETE). Focal crops inherit only.
      </p>

      <label className="block text-[13px] mb-2" htmlFor="guided-variant-kind">
        Delivery intent
      </label>
      <select
        id="guided-variant-kind"
        className="field mb-4"
        value={kind}
        disabled={pending}
        onChange={(e) => onKindChange(e.target.value)}
      >
        {(overview?.kinds ?? Object.keys(KIND_LABELS)).map((item) => (
          <option key={item} value={item}>
            {KIND_LABELS[item] ?? item}
          </option>
        ))}
      </select>

      <fieldset className="mb-4 border-0 p-0 m-0">
        <legend className="text-[13px] mb-2">Aspect</legend>
        <div className="flex flex-wrap gap-4">
          {(overview?.aspects ?? ['16:9', '9:16', '1:1']).map((item) => (
            <label key={item} className="flex items-center gap-2 text-[14px]">
              <input
                type="radio"
                name="guided-variant-aspect"
                checked={aspect === item}
                disabled={pending}
                onChange={() => setAspect(item)}
              />
              {item}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3 mb-3">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run('propose', 'Variant proposed', { kind, aspect })}
        >
          Propose
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !overview?.pending}
          onClick={() => run('preview', 'Preview ready')}
        >
          Preview
        </Button>
        <Button
          disabled={pending || !overview?.pending}
          onClick={() => run('apply', 'Variant applied to TimelineContract')}
        >
          Apply
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => run('revert', 'Reverted last timeline revision')}
        >
          Revert
        </Button>
      </div>

      {overview ? (
        <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">
          {overview.pending
            ? `Proposal pending · ${overview.pendingKind ?? ''} ${overview.pendingAspect ?? ''}`
            : overview.currentAspect
              ? `Live aspect ${overview.currentAspect}`
              : 'No timeline yet'}
          {overview.width && overview.height ? ` · ${overview.width}×${overview.height}` : ''}
        </p>
      ) : null}
      {overview?.note ? (
        <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">{overview.note}</p>
      ) : null}
      {overview?.faceAwareReframe.note ? (
        <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">
          {overview.faceAwareReframe.note}
        </p>
      ) : null}
      {status ? <p className="text-[13px] text-[color:var(--primary)] m-0 mb-2">{status}</p> : null}
      {error ? (
        <p className="text-[13px] text-[color:var(--accent)] m-0" role="alert">
          {error}{' '}
          <button type="button" className="underline bg-transparent border-0 p-0" onClick={reload}>
            Retry
          </button>
        </p>
      ) : null}
    </Card>
  );
}
