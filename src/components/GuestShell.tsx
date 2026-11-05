import type { ReactNode } from 'react';
import { BrandWordmark } from '@/components/BrandWordmark';

/**
 * Guest contribution chrome — skip link + header.
 * Children must include a single `#main` landmark (MV-AUD / Gate B a11y).
 */
export function GuestShell({
  children,
  brand = 'memorialvideo',
  meta = 'Private contribution',
  skipLabel = 'Skip to the main content',
}: {
  children: ReactNode;
  brand?: string;
  meta?: string;
  skipLabel?: string;
}) {
  return (
    <div className="mobile-shell">
      <a className="skip-link" href="#main">
        {skipLabel}
      </a>
      <header className="mobile-top">
        <BrandWordmark alt={brand} className="brand-wordmark brand-wordmark--mobile" />
        <div className="text-[11px] text-[color:var(--muted)]">{meta}</div>
      </header>
      {children}
    </div>
  );
}
