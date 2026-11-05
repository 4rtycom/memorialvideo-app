import { AppShell } from '@/components/AppShell';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { StylePicker } from '@/components/StylePicker';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function StylesPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.styles.footerTitle')}
      footerBody={creatorT(locale, 'creator.styles.footerBody')}
    >
      <Eyebrow>{creatorT(locale, 'creator.styles.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.styles.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.styles.lede')}</Lede>

      {tribute ? (
        <StylePicker selectedTheme={tribute.themeKey} locale={locale} />
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title={creatorT(locale, 'creator.styles.emptyTitle')}
          body={creatorT(locale, 'creator.styles.emptyBody')}
          primaryHref="/setup"
          primaryLabel={creatorT(locale, 'creator.common.beginSetup')}
          tone="success"
        />
      )}
    </AppShell>
  );
}
