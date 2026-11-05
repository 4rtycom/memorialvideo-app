import { AppShell } from '@/components/AppShell';
import { CeremonyPlayer } from '@/components/CeremonyPlayer';
import { Button, Eyebrow, Hero, Lede } from '@/components/ui';
import { shellProject } from '@/lib/tribute-view';
import { creatorEnv } from '@/server/env';
import { loadActiveTribute } from '@/server/session';
import { parseTimelineContract } from '@memorialvideo/contracts';
import Link from 'next/link';

/**
 * Dedicated ceremony operator surface — display + controls for live speech holds.
 * Venue ZIP also ships ceremony-player.html for offline use (MV-AUD-004).
 */
export default async function CeremonyPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const timeline = tribute?.timeline ? parseTimelineContract(tribute.timeline) : null;
  const origin = creatorEnv().NEXT_PUBLIC_APP_URL;
  const speechPauses = tribute?.musicDirectorPlan?.speechPauses ?? [];

  return (
    <AppShell
      cinema
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="One operator. Calm controls."
      footerBody="Pause for live words, then resume when the room is ready."
    >
      <Eyebrow>CEREMONY PLAYER</Eyebrow>
      <Hero className="!text-white">Present the film at the service.</Hero>
      <Lede>
        Fullscreen the display for the projector. Keep the operator panel on a second screen or below.
        Marked speech pauses hold automatically until you resume.
      </Lede>

      <CeremonyPlayer timeline={timeline} origin={origin} speechPauses={speechPauses} />

      <div className="mt-6 flex flex-wrap gap-3">
        <Button href="/share" variant="secondary">
          Ready for the service
        </Button>
        <Button href="/music" variant="ghost">
          Edit speech pauses
        </Button>
        {!timeline ? (
          <Link className="btn btn-secondary" href="/film/creating">
            Arrange first film
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
