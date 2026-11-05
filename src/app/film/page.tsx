import { AppShell } from '@/components/AppShell';
import { CeremonyOperatorPlayer } from '@/components/CeremonyOperatorPlayer';
import { FilmFamilyActions } from '@/components/FilmFamilyActions';
import { RemotionCinemaPlayer } from '@/components/RemotionCinemaPlayer';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { filmChapters } from '@/lib/copy';
import { creatorT } from '@/lib/creator-ui-messages';
import { shellProject } from '@/lib/tribute-view';
import { creatorEnv } from '@/server/env';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { chapterLabels, timelineClock } from '@/server/timeline';
import { parseTimelineContract } from '@memorialvideo/contracts';

export default async function FilmPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;
  const speechPauses = tribute?.musicDirectorPlan?.speechPauses ?? [];
  const chapters = timeline ? chapterLabels(timeline) : [...filmChapters];
  const clock = timeline ? timelineClock(timeline) : null;
  const heroName = tribute
    ? creatorT(locale, 'creator.film.heroWithName').replace('{name}', tribute.displayName)
    : creatorT(locale, 'creator.film.heroFallback');
  const origin = creatorEnv().NEXT_PUBLIC_APP_URL;

  return (
    <AppShell
      cinema
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      locale={locale}
      footerTitle={creatorT(locale, 'creator.film.footer')}
      footerBody=""
    >
      <Eyebrow>
        {timeline
          ? creatorT(locale, 'creator.film.eyebrowReady')
          : creatorT(locale, 'creator.film.eyebrow')}
      </Eyebrow>
      <Hero className="!text-white">{heroName}</Hero>
      <Lede>
        {timeline
          ? creatorT(locale, 'creator.film.ledeReady').replace(
              '{clock}',
              clock?.totalLabel ?? '',
            )
          : creatorT(locale, 'creator.film.ledeEmpty')}
      </Lede>

      <RemotionCinemaPlayer timeline={timeline} origin={origin} />

      <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">
        {creatorT(locale, 'creator.film.chapters')}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {chapters.map((c, i) => (
          <div
            key={c}
            className={`rounded-[9px] min-h-[42px] flex items-center px-4 text-[13px] ${
              i === 0
                ? 'bg-[color:var(--cinema-panel)]'
                : 'bg-[color:var(--cinema)] border border-[color:var(--cinema-panel)]'
            }`}
          >
            {c}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <CeremonyOperatorPlayer
          timeline={timeline}
          origin={origin}
          speechPauses={speechPauses}
        />
      </div>

      <FilmFamilyActions locale={locale} hasTimeline={Boolean(timeline)} />
    </AppShell>
  );
}
