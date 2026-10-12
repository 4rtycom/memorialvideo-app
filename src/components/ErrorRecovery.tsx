import { Button, Card } from '@/components/ui';

export function ErrorRecovery({
  label,
  title,
  body,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  tone = 'default',
}: {
  label: string;
  title: string;
  body: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone?: 'default' | 'success';
}) {
  return (
    <Card soft={tone === 'success'} className="!p-7">
      <div role="status">
        <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">{label}</div>
        <h2 className="serif text-[30px] m-0 mb-3">{title}</h2>
        <p className="text-[color:var(--muted)] mb-6">{body}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {primaryHref && primaryLabel ? <Button href={primaryHref}>{primaryLabel}</Button> : null}
        {secondaryHref && secondaryLabel ? (
          <Button href={secondaryHref} variant="secondary">
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
