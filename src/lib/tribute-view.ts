import type { Tribute } from '@/server/store';
import { memoryCount, readyMemoryCount } from '@/server/store';
import { lifeSpanLabel } from '@/server/tribute-helpers';
import { project as fixtureProject } from './copy';

/** Shell/chrome view model — live tribute when present; never invent Eleanor. */
export function shellProject(tribute: Tribute | null): {
  brand: string;
  title: string;
  person: string;
  years: string;
  ownerInitial: string;
} {
  if (!tribute) {
    return {
      brand: fixtureProject.brand,
      title: 'Your remembrance',
      person: '',
      years: '',
      ownerInitial: 'Y',
    };
  }
  return {
    brand: fixtureProject.brand,
    title: `${possessive(tribute.displayName)} remembrance`,
    person: tribute.displayName,
    years: lifeSpanLabel(tribute),
    ownerInitial: tribute.ownerInitial || 'Y',
  };
}

export function possessive(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Their';
  }
  return trimmed.endsWith('s') ? `${trimmed}'` : `${trimmed}'s`;
}

export function overviewCopy(tribute: Tribute | null): {
  hero: string;
  lede: string;
  cardEyebrow: string;
  storyTitle: string;
  storyMeta: string;
  progressLabel: string;
  progressWidth: string;
} {
  if (!tribute) {
    return {
      hero: 'Your stories, beautifully kept.',
      lede: 'Begin a private memorial video. Everything you add is saved along the way.',
      cardEyebrow: 'START HERE',
      storyTitle: 'Begin a memorial video',
      storyMeta: 'A calm place for one life story',
      progressLabel: 'No tribute open yet',
      progressWidth: '8%',
    };
  }
  const count = memoryCount(tribute);
  const readyCount = readyMemoryCount(tribute);
  const ready = tribute.firstFilmStage === 'ready_to_review';
  return {
    hero: 'Your stories, beautifully kept.',
    lede: 'Continue where you left off. Everything is saved along the way.',
    cardEyebrow: 'YOUR ACTIVE MEMORIAL VIDEO',
    storyTitle: `${possessive(tribute.displayName)} story`,
    storyMeta:
      readyCount === 0
        ? count === 0
          ? 'Ready for the first memories'
          : 'Memories are still preparing'
        : `A film made from ${readyCount} cherished ${readyCount === 1 ? 'memory' : 'memories'}`,
    progressLabel: ready ? 'Your first film is ready to review' : 'Your workspace is waiting',
    progressWidth: ready ? '70%' : readyCount > 0 ? '40%' : '15%',
  };
}

/** Owner mobile home (`/m`) — live tribute only; never invent Eleanor / 48 memories. */
export function mobileHomeCopy(tribute: Tribute | null): {
  eyebrow: string;
  heroLine1: string;
  heroLine2: string;
  meta: string;
  filmTitle: string;
  primaryHref: string;
  primaryLabel: string;
  posterSrc: string;
} {
  if (!tribute) {
    return {
      eyebrow: 'YOUR PERSONAL WORKSPACE',
      heroLine1: 'Begin a memorial',
      heroLine2: 'film here.',
      meta: 'No tribute open yet',
      filmTitle: 'Your remembrance',
      primaryHref: '/setup',
      primaryLabel: 'Begin setup  ↗',
      posterSrc: '/fixtures/workspace-family.png',
    };
  }

  const count = memoryCount(tribute);
  const ready = tribute.firstFilmStage === 'ready_to_review';
  const memoryWord = count === 1 ? 'memory' : 'memories';
  const firstMemory = tribute.memories[0]?.imagePath;
  const posterSrc =
    firstMemory ??
    (tribute.isFixtureSeed ? '/fixtures/eleanor.png' : '/fixtures/workspace-family.png');

  return {
    eyebrow: `${possessive(tribute.displayName).toUpperCase()} PERSONAL WORKSPACE`,
    heroLine1: ready ? `${possessive(tribute.displayName)} story is` : `Gather memories for`,
    heroLine2: ready ? 'ready to watch.' : `${possessive(tribute.displayName)} story.`,
    meta: ready
      ? `${count} ${memoryWord} collected  ·  First film ready`
      : `${count} ${memoryWord} collected  ·  Workspace waiting`,
    filmTitle: `${possessive(tribute.displayName)} remembrance`,
    primaryHref: ready ? '/film' : '/memories',
    primaryLabel: ready ? '▶  Watch the first film' : 'Add memories  ↗',
    posterSrc,
  };
}
