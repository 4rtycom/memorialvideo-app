'use client';

import type { LaunchLanguage } from '@memorialvideo/contracts';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { creatorT } from '@/lib/creator-ui-messages';

/**
 * Optional disclosure for Advanced Studio and other professional tools.
 * Closed by default so the guided family route stays uninterrupted (MV-AUD-015).
 * Children mount only after the family opts in — no background advanced fetches.
 */
export function MoreControlDisclosure({
  locale,
  children,
  className = '',
}: {
  locale: LaunchLanguage;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function onToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    setOpen(event.currentTarget.open);
  }

  return (
    <details
      className={`more-control ${className}`.trim()}
      data-testid="more-control"
      onToggle={onToggle}
    >
      <summary className="more-control-summary">
        <span className="more-control-label">{creatorT(locale, 'creator.moreControl')}</span>
        <span className="more-control-hint">{creatorT(locale, 'creator.moreControl.hint')}</span>
      </summary>
      {open ? <div className="more-control-body">{children}</div> : null}
    </details>
  );
}
