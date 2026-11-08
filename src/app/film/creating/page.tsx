import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { FirstFilmArrange } from '@/components/FirstFilmArrange';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT, type CreatorUiKey } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import {
  FIRST_FILM_READY_PHOTO_THRESHOLD,
  firstFilmProgress,
  type FirstFilmStage,
} from '@/server/store';

function progressLabelKey(stage: FirstFilmStage): CreatorUiKey {
  switch (stage) {
    case 'ready_to_review':
      return 'creator.creating.progressReady';
    case 'finishing':
      return 'creator.creating.progressFinishing';
    case 'arranging_film':
      return 'creator.creating.progressPreparing';
    case 'building_story':
      return 'creator.creating.progressBuilding';
    case 'preparing_memories':
      return 'creator.creating.progressOrganising';
    default:
      return 'creator.creating.progressWaiting';
  }
}

export default async function CreatingPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const stage = tribute?.firstFilmStage ?? 'idle';
  const progress = firstFilmProgress(stage);
  const readyCount = tribute?.memories.filter((m) => m.ingestStatus === 'READY').length ?? 0;
  const canArrange = Boolean(tribute) && readyCount >= FIRST_FILM_READY_PHOTO_THRESHOLD && stage !== 'ready_to_review';
  const heading = tribute
    ? creatorT(locale, 'creator.creating.headingNamed').replace('{name}', tribute.displayName)
    : creatorT(locale, 'creator.creating.headingTheir');

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.creating.footerTitle')}
      footerBody={creatorT(locale, 'creator.creating.footerBody')}
    >
      <Eyebrow>{creatorT(locale, 'creator.creating.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.creating.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.creating.lede')}</Lede>

      <Card className="!p-5 grid gap-6 lg:grid-cols-[minmax(0,471px)_minmax(0,1fr)] items-stretch">
        <div className="relative h-[420px] rounded-[10px] overflow-hidden">
          <Image src="/fixtures/finish-film.png" alt="" fill className="object-cover" sizes="471px" />
          <div className="absolute inset-x-0 bottom-0 bg-[color:var(--cinema)]/90 text-white p-6">
            <div className="text-[11px] font-bold text-[color:var(--accent)] mb-2">
              {creatorT(locale, 'creator.creating.cardTag')}
            </div>
            <div className="serif text-[36px] leading-none">
              {creatorT(locale, 'creator.creating.cardTitle')}
            </div>
          </div>
        </div>
        <div className="py-8 pr-4">
          <h2 className="serif text-[31px] m-0 mb-4">{heading}</h2>
          <p className="text-[color:var(--muted)] mb-8">{creatorT(locale, 'creator.creating.body')}</p>
          <div className="progress mb-4">
            <span style={{ width: progress.width }} />
          </div>
          <p className="font-medium mb-6">{creatorT(locale, progressLabelKey(stage))}</p>
          <ul className="space-y-3 text-[color:var(--muted)] list-none p-0 m-0 mb-8">
            <li>
              {progress.organised ? '✓' : '◌'}  {creatorT(locale, 'creator.creating.stepOrganised')}
            </li>
            <li>
              {progress.prepared ? '✓' : '◌'}  {creatorT(locale, 'creator.creating.stepPrepared')}
            </li>
            <li>
              {progress.finishing ? '✓' : '◌'}  {creatorT(locale, 'creator.creating.stepFinishing')}
            </li>
          </ul>
          {tribute ? (
            <FirstFilmArrange
              canArrange={canArrange}
              alreadyReady={stage === 'ready_to_review'}
              locale={locale}
            />
          ) : (
            <Button href="/setup">{creatorT(locale, 'creator.common.beginSetup')}</Button>
          )}
          {!canArrange && tribute && stage !== 'ready_to_review' ? (
            <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">
              {creatorT(locale, 'creator.creating.readyCount')
                .replace('{ready}', String(readyCount))
                .replace('{needed}', String(FIRST_FILM_READY_PHOTO_THRESHOLD))}
            </p>
          ) : null}
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.creating.leaveSafe')}</p>
        <Button href="/workspace" variant="secondary">
          {creatorT(locale, 'creator.creating.backWorkspace')}
        </Button>
      </div>
    </AppShell>
  );
}
