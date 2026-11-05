'use client';

import { useEffect, useState } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { t, type CommonKey } from '@memorialvideo/i18n';
import { Button, Card, ErrorState } from '@/components/ui';

type Finding = {
  id: string;
  code: string;
  severity: string;
  status: string;
  labelKey: string;
  detail?: string | null;
  evidenceState?: string;
  checkState?: 'checked' | 'not_checked';
};

function safeT(locale: LaunchLanguage, key: string, fallback: string): string {
  try {
    return t(locale, key as CommonKey);
  } catch {
    return fallback;
  }
}

export function CeremonyReadinessPanel({ locale = 'en' }: { locale?: LaunchLanguage }) {
  const [blocking, setBlocking] = useState<number | null>(null);
  const [warnings, setWarnings] = useState(0);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [packAllowed, setPackAllowed] = useState<boolean | null>(null);
  const [checkedCount, setCheckedCount] = useState(0);
  const [notCheckedCount, setNotCheckedCount] = useState(0);
  const [allChecksComplete, setAllChecksComplete] = useState(false);
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
          checkedCount?: number;
          notCheckedCount?: number;
          allChecksComplete?: boolean;
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
        setCheckedCount(body.checkedCount ?? 0);
        setNotCheckedCount(body.notCheckedCount ?? 0);
        setAllChecksComplete(Boolean(body.allChecksComplete));
      })
      .catch(() => setError('unavailable'));
  }, [tick]);

  const checkedFindings = findings.filter((f) => f.checkState === 'checked');
  const notCheckedFindings = findings.filter((f) => f.checkState === 'not_checked');

  return (
    <Card className="!p-6 mb-5 ceremony-readiness-panel">
      <h3 className="serif text-[28px] m-0 mb-2">{t(locale, 'readiness.title')}</h3>
      <p className="text-[color:var(--muted)] mb-4">{t(locale, 'readiness.body')}</p>
      <p className="text-[13px] text-[color:var(--muted)] mb-4 m-0" data-testid="readiness-honesty">
        {t(locale, 'readiness.honesty')}
      </p>
      {error ? (
        <ErrorState
          title={error === 'unavailable' ? t(locale, 'readiness.failed') : error}
          body="Your tribute work is still safe."
          action={
            <Button variant="secondary" onClick={() => setTick((n) => n + 1)}>
              {t(locale, 'readiness.retry')}
            </Button>
          }
        />
      ) : blocking === null ? (
        <p className="text-[13px] text-[color:var(--muted)] m-0">{t(locale, 'readiness.loading')}</p>
      ) : (
        <>
          <p className="text-[14px] m-0 mb-3" data-testid="readiness-summary">
            {blocking} {t(locale, 'readiness.counts.blocking').toLowerCase()} · {warnings}{' '}
            {t(locale, 'readiness.counts.warnings').toLowerCase()} · {checkedCount}{' '}
            {t(locale, 'readiness.evidence.checked')} · {notCheckedCount}{' '}
            {t(locale, 'readiness.evidence.notChecked')}
            {packAllowed === false
              ? ` · ${t(locale, 'readiness.packBlocked')}`
              : packAllowed
                ? ` · ${t(locale, 'readiness.packClear')}`
                : ''}
          </p>
          {allChecksComplete ? (
            <p className="text-[13px] m-0 mb-3" role="status">
              {t(locale, 'readiness.complete')}
            </p>
          ) : (
            <p className="text-[13px] text-[color:var(--muted)] m-0 mb-3" role="status">
              {t(locale, 'readiness.incomplete')}
            </p>
          )}
          {checkedFindings.length > 0 ? (
            <div className="mb-4">
              <h4 className="text-[12px] font-bold tracking-wide uppercase m-0 mb-2">
                {t(locale, 'readiness.checkedHeading')}
              </h4>
              <ul className="list-none p-0 m-0 grid gap-2 text-[13px]" data-testid="readiness-checked">
                {checkedFindings.slice(0, 10).map((f) => (
                  <li key={f.id} className="text-[color:var(--ink)]">
                    <strong>
                      {safeT(locale, `readiness.severity.${f.severity}`, f.severity)}
                    </strong>
                    {' · '}
                    {safeT(locale, f.labelKey, f.code.replace(/_/g, ' '))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {notCheckedFindings.length > 0 ? (
            <div>
              <h4 className="text-[12px] font-bold tracking-wide uppercase m-0 mb-2">
                {t(locale, 'readiness.notCheckedHeading')}
              </h4>
              <ul
                className="list-none p-0 m-0 grid gap-2 text-[13px] text-[color:var(--muted)]"
                data-testid="readiness-not-checked"
              >
                {notCheckedFindings.slice(0, 8).map((f) => (
                  <li key={f.id}>
                    {safeT(locale, f.labelKey, f.code.replace(/_/g, ' '))}
                    {' · '}
                    {t(locale, 'readiness.evidence.deferred')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
