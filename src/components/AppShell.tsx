'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { BrandWordmark } from '@/components/BrandWordmark';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SaveStatus } from '@/components/SaveStatus';
import { creatorNavLabels, creatorT } from '@/lib/creator-ui-messages';
import {
  ADVANCED_OPTIONAL,
  FAMILY_PRIMARY_NAV,
  familyPrimaryForPath,
  isAdvancedPath,
} from '@/lib/family-nav';

function NavLinks({
  pathname,
  labels,
  className,
}: {
  pathname: string;
  labels: Record<string, string>;
  className: string;
}) {
  const activePrimary = familyPrimaryForPath(pathname);
  return (
    <>
      {FAMILY_PRIMARY_NAV.map((item) => {
        const active = activePrimary === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${className} ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="nav-item-label">{labels[item.href] ?? item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export function AppShell({
  children,
  cinema = false,
  footerTitle = 'Help is always here',
  footerBody = 'No need to finish today.',
  brand = 'memorialvideo',
  title = 'Your remembrance',
  ownerInitial = 'Y',
  locale: localeProp,
}: {
  children: ReactNode;
  cinema?: boolean;
  footerTitle?: string;
  footerBody?: string;
  brand?: string;
  title?: string;
  ownerInitial?: string;
  locale?: LaunchLanguage;
}) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<LaunchLanguage>(localeProp ?? 'en');

  useEffect(() => {
    if (localeProp) {
      setLocale(localeProp);
      return;
    }
    void fetch('/api/locale')
      .then((r) => r.json())
      .then((body: { locale?: LaunchLanguage }) => {
        if (body.locale) setLocale(body.locale);
      })
      .catch(() => undefined);
  }, [localeProp]);

  const labels = creatorNavLabels(locale);
  const advancedOpen = isAdvancedPath(pathname);

  return (
    <div className={`app-shell ${cinema ? 'cinema-mode' : ''}`}>
      <a className="skip-link" href="#main">
        {creatorT(locale, 'creator.a11y.skip')}
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label={brand}>
          <BrandWordmark alt={brand} priority />
        </Link>
        <div className="nav-label">{creatorT(locale, 'creator.nav.yourTribute')}</div>
        <nav className="nav-list" aria-label={creatorT(locale, 'creator.a11y.navPrimary')}>
          <NavLinks pathname={pathname} labels={labels} className="nav-item" />
        </nav>
        <details className="nav-advanced" open={advancedOpen || undefined}>
          <summary className="nav-advanced-summary">
            {creatorT(locale, 'creator.nav.advanced')}
          </summary>
          <nav className="nav-advanced-list" aria-label={creatorT(locale, 'creator.nav.advanced')}>
            {ADVANCED_OPTIONAL.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const labelKey =
                item.href === '/film/studio'
                  ? ('creator.nav.advancedStudio' as const)
                  : ('creator.nav.enhance' as const);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item nav-item-nested ${active ? 'active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span>{creatorT(locale, labelKey)}</span>
                </Link>
              );
            })}
          </nav>
        </details>
        <div className="sidebar-foot">
          <h3>{footerTitle}</h3>
          <p>{footerBody}</p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-cluster">
            <div className="topbar-meta">
              <LocaleSwitcher locale={locale} label={creatorT(locale, 'creator.locale.label')} />
              <SaveStatus locale={locale} />
            </div>
            <Link href="/account" className="avatar" aria-label={creatorT(locale, 'creator.a11y.account')}>
              {ownerInitial}
            </Link>
          </div>
        </header>
        {/* Visible under 980px when the sticky sidebar is hidden — keyboard path to primary routes. */}
        <nav className="primary-nav-mobile" aria-label={creatorT(locale, 'creator.a11y.navMobile')}>
          <NavLinks pathname={pathname} labels={labels} className="nav-item" />
        </nav>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
