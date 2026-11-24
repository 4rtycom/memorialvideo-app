import { AppShell } from '@/components/AppShell';
import { Eyebrow, Hero } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { LEGAL_DRAFT, LEGAL_PAGES, supportEmail, type LegalPageKey } from '@/lib/legal-content';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

const TITLE_KEY = {
  privacy: 'creator.legal.privacy',
  terms: 'creator.legal.terms',
  cookies: 'creator.legal.cookies',
} as const;

export async function LegalPage({ page }: { page: LegalPageKey }) {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute, locale);
  const content = LEGAL_PAGES[page];
  const email = supportEmail();

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <Eyebrow>{creatorT(locale, 'creator.legal.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, TITLE_KEY[page])}</Hero>
      <div className="max-w-[720px]">
        {locale !== 'en' ? (
          <p className="text-[14px] text-[color:var(--muted)] mt-0" lang="en">
            {creatorT(locale, 'creator.legal.englishOnly')}
          </p>
        ) : null}
        {LEGAL_DRAFT ? (
          <p className="text-[14px] rounded-[9px] border border-[color:var(--border)] p-3" role="note" lang="en">
            Draft text, not yet legally reviewed.
          </p>
        ) : null}
        <div lang="en">
          {content.sections.map((section) => (
            <section key={section.heading} className="mb-6">
              <h2 className="serif text-[26px] m-0 mb-2">{section.heading}</h2>
              {section.paragraphs.map((text) => (
                <p key={text} className="text-[16px] m-0 mb-3">
                  {text}
                </p>
              ))}
            </section>
          ))}
          {email ? (
            <p className="text-[16px]">
              <a href={`mailto:${email}`}>{email}</a>
            </p>
          ) : null}
          <p className="text-[14px] text-[color:var(--muted)]">Last updated {content.updated}</p>
        </div>
      </div>
    </AppShell>
  );
}
