'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { creatorNavLabels, creatorT } from '@/lib/creator-ui-messages';
import { navItems } from '@/lib/copy';

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
      <aside className="sidebar">
        <Link href="/" className="brand">
          {brand}
        </Link>
        <div className="nav-label">{creatorT(locale, 'creator.nav.yourTribute')}</div>
        <nav className="nav-list" aria-label="Tribute navigation">
          {navItems.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/' || pathname === '/setup' || pathname === '/workspace'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                <span className="nav-icon" aria-hidden>
                  {item.icon}
                </span>
                <span>{labels[item.href] ?? item.label}</span>
              </Link>
            );
          })}
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
            <span>✓  {creatorT(locale, 'creator.saved')}</span>
            <Link href="/account" className="avatar" aria-label="Account">
              {ownerInitial}
            </Link>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
