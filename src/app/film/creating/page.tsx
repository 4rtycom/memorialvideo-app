import Image from 'next/image';
import { AppShell } from '@/components/AppShell';
import { FirstFilmArrange } from '@/components/FirstFilmArrange';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { possessive, shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';
import { FIRST_FILM_READY_PHOTO_THRESHOLD, firstFilmProgress } from '@/server/store';

export default async function CreatingPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const stage = tribute?.firstFilmStage ?? 'idle';
  const progress = firstFilmProgress(stage);
  const readyCount = tribute?.memories.filter((m) => m.ingestStatus === 'READY').length ?? 0;
  const canArrange = Boolean(tribute) && readyCount >= FIRST_FILM_READY_PHOTO_THRESHOLD && stage !== 'ready_to_review';
  const titleName = tribute ? possessive(tribute.displayName) : 'their';

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={shell.ownerInitial}
      footerTitle="Create it in your own time."
      footerBody="Everything saves as you go."
    >
      <Eyebrow>WE&apos;RE BRINGING THE MEMORIES TOGETHER</Eyebrow>
      <Hero>Something beautiful is on its way.</Hero>
      <Lede>Your film is taking shape. You don’t need to stay on this page.</Lede>

      <Card className="!p-5 grid gap-6 lg:grid-cols-[471px_1fr] items-stretch">
        <div className="relative h-[420px] rounded-[10px] overflow-hidden">
          <Image src="/fixtures/finish-film.png" alt="" fill className="object-cover" sizes="471px" />
          <div className="absolute inset-x-0 bottom-0 bg-[color:var(--cinema)]/90 text-white p-6">
            <div className="text-[11px] font-bold text-[color:var(--accent)] mb-2">A LIFE BEAUTIFULLY LIVED</div>
            <div className="serif text-[36px] leading-none">A story made from love.</div>
          </div>
        </div>
        <div className="py-8 pr-4">
          <h2 className="serif text-[31px] m-0 mb-4">Creating {titleName} first film</h2>
          <p className="text-[color:var(--muted)] mb-8">Carefully arranging the photographs, words and music.</p>
          <div className="progress mb-4">
            <span style={{ width: progress.width }} />
          </div>
          <p className="font-medium mb-6">{progress.label}</p>
          <ul className="space-y-3 text-[color:var(--muted)] list-none p-0 m-0 mb-8">
            <li>{progress.organised ? '✓' : '◌'}  Memories organised</li>
            <li>{progress.prepared ? '✓' : '◌'}  Photographs prepared</li>
            <li>{progress.finishing ? '✓' : '◌'}  Adding finishing touches</li>
          </ul>
          {tribute ? (
            <FirstFilmArrange canArrange={canArrange} alreadyReady={stage === 'ready_to_review'} />
          ) : (
            <Button href="/setup">Begin setup  ↗</Button>
          )}
          {!canArrange && tribute && stage !== 'ready_to_review' ? (
            <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">
              {readyCount}/{FIRST_FILM_READY_PHOTO_THRESHOLD} ready memories
            </p>
          ) : null}
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[color:var(--muted)] m-0">You can safely leave and come back when it’s ready.</p>
        <Button href="/workspace" variant="secondary">
          Back to workspace
        </Button>
      </div>
    </AppShell>
  );
}
