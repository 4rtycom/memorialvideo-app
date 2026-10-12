import { AppShell } from '@/components/AppShell';
import { CeremonyChecklistPanel } from '@/components/CeremonyChecklistPanel';
import { CeremonyReadinessPanel } from '@/components/CeremonyReadinessPanel';
import { ErrorRecovery } from '@/components/ErrorRecovery';
import { MemorialPackPanel } from '@/components/MemorialPackPanel';
import { RenderJobPanel } from '@/components/RenderJobPanel';
import { ShareDownloadPanel } from '@/components/ShareDownloadPanel';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { planCeremonyPackWithReadiness } from '@/server/ceremony-pack-local';
import { isLocalCreatorEnv } from '@/server/env';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { planDownloadFromJobs, summarizeRenderJobs } from '@/server/render';
import { loadActiveTribute } from '@/server/session';
import { summarizeShareList } from '@/server/share-list';
import { entitlementView } from '@/server/store';
import { isStripeMemorialPackConfigured } from '@/server/stripe-checkout';

export default async function SharePage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const entitlement = entitlementView(tribute);
  const localFulfillAllowed = isLocalCreatorEnv();
  const stripeConfigured = isStripeMemorialPackConfigured();
  const download = planDownloadFromJobs(tribute);
  const ceremonyPack = await planCeremonyPackWithReadiness(tribute);
  const shares = tribute ? summarizeShareList(tribute) : [];
  const jobs = tribute ? summarizeRenderJobs(tribute) : [];
  const watchPath = tribute
    ? `Create a private link for ${tribute.displayName}`
    : 'Create a tribute to share a private screening';

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle="A beautiful film, made together."
      footerBody=""
    >
      <Eyebrow>{creatorT(locale, 'creator.share.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.share.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.share.lede')}</Lede>

      {tribute ? (
        <>
          <RenderJobPanel initialJobs={jobs} />
          <CeremonyReadinessPanel />
          <ShareDownloadPanel
            entitlementActive={entitlement.active}
            download={download}
            ceremonyPack={ceremonyPack}
            initialShares={shares}
            watchPathPlaceholder={watchPath}
            locale={locale}
          />
          <div className="card !p-7 mt-5">
            <CeremonyChecklistPanel initial={tribute.ceremonyChecklist} locale={locale} />
          </div>
          <MemorialPackPanel
            active={entitlement.active}
            localFulfillAllowed={localFulfillAllowed}
            stripeConfigured={stripeConfigured}
            projectPublicId={tribute.publicId}
            locale={locale}
          />
        </>
      ) : (
        <ErrorRecovery
          label="EMPTY WORKSPACE"
          title="Create a tribute first"
          body="Then unlock Memorial Pack for download and private sharing."
          primaryHref="/setup"
          primaryLabel="Begin setup  ↗"
          secondaryHref="/workspace"
          secondaryLabel="Open workspace"
          tone="success"
        />
      )}
      {!tribute ? null : !entitlement.active ? (
        <p className="text-[13px] text-[color:var(--muted)] mt-4">
          <Button href="/share" variant="ghost">
            Refresh after local Memorial Pack
          </Button>
        </p>
      ) : null}
    </AppShell>
  );
}
