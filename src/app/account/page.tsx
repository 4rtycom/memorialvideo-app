import { AccountPanel } from '@/components/AccountPanel';
import { AppShell } from '@/components/AppShell';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute, readActiveTributeId } from '@/server/session';
import { listTributeSummaries } from '@/server/store';

export default async function AccountPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const activeId = await readActiveTributeId();
  const tributes = (await listTributeSummaries()).map((t) => ({
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
      <AccountPanel initialTributes={tributes} />
    </AppShell>
  );
}
