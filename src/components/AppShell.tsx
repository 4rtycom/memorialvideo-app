'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { BrandWordmark } from '@/components/BrandWordmark';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { SaveStatus } from '@/components/SaveStatus';
import { creatorNavLabels, creatorT } from '@/lib/creator-ui-messages';
import { navItems } from '@/lib/copy';

function navActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/' || pathname === '/setup' || pathname === '/workspace';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  pathname,
  labels,
  className,
}: {
  pathname: string;
  labels: Record<string, string>;
  className: string;
}) {
  return (
    <>
      {navItems.map((item) => {
        const active = navActive(pathname, item.href);
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
            <span>{labels[item.href] ?? item.label}</span>
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
        <div className="sidebar-foot">
          <h3>{footerTitle}</h3>
          <p>{footerBody}</p>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-meta">
            <LocaleSwitcher locale={locale} label={creatorT(locale, 'creator.locale.label')} />
            <SaveStatus locale={locale} />
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
