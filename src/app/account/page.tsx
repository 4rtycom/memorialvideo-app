import { AccountPanel } from '@/components/AccountPanel';
import { AppShell } from '@/components/AppShell';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
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
      title="Account"
      ownerInitial={tribute?.ownerInitial ?? 'Y'}
      locale={locale}
      footerTitle="Your tributes stay private."
      footerBody=""
    >
      <Eyebrow>ACCOUNT</Eyebrow>
      <Hero>Your tributes</Hero>
      <Lede>Open a tribute workspace or permanently delete a local draft. Nothing is public by default.</Lede>
      <div className="mb-6">
        {signedIn ? (
          <form action="/api/auth/sign-out" method="post">
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        ) : (
          <Button href="/sign-in">Sign in</Button>
        )}
      </div>
      <AccountPanel initialTributes={rows} />
    </AppShell>
  );
}
