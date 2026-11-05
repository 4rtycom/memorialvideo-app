import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { overviewCopy, shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function OverviewPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const copy = overviewCopy(tribute);
  const poster = tribute?.isFixtureSeed ? '/fixtures/eleanor.png' : '/fixtures/workspace-family.png';

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <Eyebrow>
        {tribute
          ? creatorT(locale, 'creator.home.welcomeBack')
          : creatorT(locale, 'creator.home.welcome')}
      </Eyebrow>
      <Hero>{copy.hero}</Hero>
      <Lede>{copy.lede}</Lede>

      <Card className="!p-4 grid gap-5 md:grid-cols-[332px_1fr] items-stretch">
        <div className="relative h-[308px] overflow-hidden rounded-[9px]">
          <Image src={poster} alt="" fill className="object-cover" sizes="332px" priority />
        </div>
        <div className="flex flex-col justify-center py-4 pr-4">
          <Eyebrow>{copy.cardEyebrow}</Eyebrow>
          <h2 className="serif text-[53px] leading-[1.02] m-0 mb-3">{copy.storyTitle}</h2>
          <p className="text-[color:var(--muted)] text-[17px] m-0 mb-5">{copy.storyMeta}</p>
          <div className="progress mb-3">
            <span style={{ width: copy.progressWidth }} />
          </div>
          <p className="font-medium text-[16px] m-0 mb-2">{copy.progressLabel}</p>
          <p className="text-[color:var(--muted)] text-[13px] m-0 mb-6">
            {tribute
              ? creatorT(locale, 'creator.home.updatedPrivate').replace(
                  '{when}',
                  new Date(tribute.updatedAt).toLocaleString(locale),
                )
              : creatorT(locale, 'creator.home.privateNothing')}
          </p>
          <div className="flex flex-wrap gap-3">
            {tribute ? (
              <>
                <Button href="/film">{creatorT(locale, 'creator.home.watch')}</Button>
                <Button href="/workspace" variant="secondary">
                  {creatorT(locale, 'creator.home.openWorkspace')}
                </Button>
              </>
            ) : (
              <>
                <Button href="/setup">{creatorT(locale, 'creator.home.begin')}</Button>
                <Button href="/workspace" variant="secondary">
                  {creatorT(locale, 'creator.home.openWorkspace')}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="serif text-[30px] m-0 mb-2">{creatorT(locale, 'creator.home.nextStep')}</h3>
          <p className="text-[color:var(--muted)] m-0">
            {tribute
              ? creatorT(locale, 'creator.home.nextWithTribute')
              : creatorT(locale, 'creator.home.nextWithout')}
          </p>
        </div>
        <Button href={tribute ? '/memories' : '/setup'} variant="secondary">
          {tribute
            ? creatorT(locale, 'creator.home.viewMemories')
            : creatorT(locale, 'creator.home.startSetup')}
        </Button>
      </div>
      {shell.person ? <p className="sr-only">{shell.person}</p> : null}
    </AppShell>
  );
}
