import { AccountPanel } from '@/components/AccountPanel';
import { AppShell } from '@/components/AppShell';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { AuthRequiredError, readAccountSession, withRequestOwner } from '@/server/account-session';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute, readActiveTributeId } from '@/server/session';
import { listTributeSummaries } from '@/server/store';

export default async function AccountPage() {
  const signedIn = Boolean(await readAccountSession());
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const activeId = await readActiveTributeId();
  let tributes: Awaited<ReturnType<typeof listTributeSummaries>> = [];
  try {
    tributes = await withRequestOwner(() => listTributeSummaries());
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) {
      throw error;
    }
  }
  const rows = tributes.map((t) => ({
    ...t,
    isActive: t.publicId === activeId,
  }));

  return (
    <AppShell
      brand="memorialvideo"
      title={creatorT(locale, 'creator.account.title')}
      ownerInitial={tribute?.ownerInitial ?? 'Y'}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.account.footer')}
      footerBody=""
    >
      <Eyebrow>{creatorT(locale, 'creator.account.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.account.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.account.lede')}</Lede>
      <div className="mb-6">
        {signedIn ? (
          <form action="/api/auth/sign-out" method="post">
            <Button type="submit" variant="secondary">
              {creatorT(locale, 'creator.account.signOut')}
            </Button>
          </form>
        ) : (
          <Button href="/sign-in">{creatorT(locale, 'creator.account.signIn')}</Button>
        )}
      </div>
      <AccountPanel initialTributes={rows} locale={locale} />
    </AppShell>
  );
}
