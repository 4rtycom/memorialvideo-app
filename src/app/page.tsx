import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { overviewCopy, shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

export default async function OverviewPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const copy = overviewCopy(tribute);
  const poster = tribute?.isFixtureSeed ? '/fixtures/eleanor.png' : '/fixtures/workspace-family.png';

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial}>
      <Eyebrow>{tribute ? 'WELCOME BACK' : 'WELCOME'}</Eyebrow>
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
              ? `Updated ${new Date(tribute.updatedAt).toLocaleString()}  ·  Private workspace`
              : 'Private workspace  ·  Nothing shared publicly'}
          </p>
          <div className="flex flex-wrap gap-3">
            {tribute ? (
              <>
                <Button href="/film">▶  Watch the film</Button>
                <Button href="/workspace" variant="secondary">
                  Open workspace  ↗
                </Button>
              </>
            ) : (
              <>
                <Button href="/setup">Begin a memorial video  ↗</Button>
                <Button href="/workspace" variant="secondary">
                  Open workspace  ↗
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="serif text-[30px] m-0 mb-2">A gentle next step</h3>
          <p className="text-[color:var(--muted)] m-0">
            {tribute
              ? 'Invite another loved one or make your finishing touches.'
              : 'Start with a name. We’ll keep every detail private and calm.'}
          </p>
        </div>
        <Button href={tribute ? '/memories' : '/setup'} variant="secondary">
          {tribute ? 'View all memories' : 'Start setup'}
        </Button>
      </div>
      {shell.person ? <p className="sr-only">{shell.person}</p> : null}
    </AppShell>
  );
}
