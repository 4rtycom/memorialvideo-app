import { AppShell } from '@/components/AppShell';
import { CeremonyOperatorPlayer } from '@/components/CeremonyOperatorPlayer';
import { RemotionCinemaPlayer } from '@/components/RemotionCinemaPlayer';
import { Eyebrow, Hero, Lede } from '@/components/ui';
import { filmChapters } from '@/lib/copy';
import { possessive, shellProject } from '@/lib/tribute-view';
import { creatorEnv } from '@/server/env';
import { loadActiveTribute } from '@/server/session';
import { chapterLabels, timelineClock } from '@/server/timeline';
import { parseTimelineContract } from '@memorialvideo/contracts';
import Link from 'next/link';

export default async function FilmPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;
  const speechPauses = tribute?.musicDirectorPlan?.speechPauses ?? [];
  const chapters = timeline ? chapterLabels(timeline) : [...filmChapters];
  const clock = timeline ? timelineClock(timeline) : null;
  const heroName = tribute ? `${possessive(tribute.displayName)} beautiful life.` : 'Their beautiful life.';
  const origin = creatorEnv().NEXT_PUBLIC_APP_URL;

  return (
    <AppShell
      cinema
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="No complicated editing needed."
      footerBody=""
    >
      <Eyebrow>{timeline ? 'YOUR FILM IS READY' : 'YOUR FILM'}</Eyebrow>
      <Hero className="!text-white">{heroName}</Hero>
      <Lede>
        {timeline
          ? `Private screening · ${clock?.totalLabel ?? ''} · your film`
          : 'Arrange the first film to open the screening room.'}
      </Lede>

      <RemotionCinemaPlayer timeline={timeline} origin={origin} />

      <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">CHAPTERS</div>
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

      <div className="mt-8 flex flex-wrap gap-3">
        {!timeline ? (
          <Link className="btn btn-secondary" href="/film/creating">
            Arrange first film
          </Link>
        ) : null}
        <Link className="btn btn-secondary" href="/film/edit">
          Edit story
        </Link>
        <Link className="btn btn-secondary" href="/film/styles">
          Atmosphere
        </Link>
        <Link className="btn btn-secondary" href="/film/studio">
          Studio
        </Link>
        <Link className="btn btn-secondary" href="/ceremony">
          Ceremony Player
        </Link>
        <Link className="btn btn-secondary" href="/share">
          Ready for the service
        </Link>
      </div>
    </AppShell>
  );
}
