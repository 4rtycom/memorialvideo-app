import type { LaunchLanguage } from '@memorialvideo/contracts';
import { creatorT } from '@/lib/creator-ui-messages';
import type { Tribute } from '@/server/store';
import { memoryCount, readyMemoryCount } from '@/server/store';
import { lifeSpanLabel } from '@/server/tribute-helpers';
import { project as fixtureProject } from './copy';

/** Shell/chrome view model — live tribute when present; never invent Eleanor. */
export function shellProject(
  tribute: Tribute | null,
  locale: LaunchLanguage = 'en',
): {
  brand: string;
  title: string;
  person: string;
  years: string;
  ownerInitial: string;
} {
  if (!tribute) {
    return {
      brand: fixtureProject.brand,
      title: creatorT(locale, 'creator.shell.title'),
      person: '',
      years: '',
      ownerInitial: 'Y',
    };
  }
  return {
    brand: fixtureProject.brand,
    title:
      locale === 'en'
        ? `${possessive(tribute.displayName)} remembrance`
        : creatorT(locale, 'creator.shell.titleNamed').replace('{name}', tribute.displayName),
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

export function overviewCopy(
  tribute: Tribute | null,
  locale: LaunchLanguage = 'en',
  storageWritable = true,
): {
  hero: string;
  lede: string;
  cardEyebrow: string;
  storyTitle: string;
  storyMeta: string;
  progressLabel: string;
  progressWidth: string;
} {
  // Never promise "saved along the way" while storage is not writable.
  const savedLine = storageWritable ? ` ${creatorT(locale, 'creator.home.savedAlong')}` : '';
  if (!tribute) {
    return {
      hero: creatorT(locale, 'creator.home.hero'),
      lede: `${creatorT(locale, 'creator.home.ledeBegin')}${savedLine}`,
      cardEyebrow: creatorT(locale, 'creator.home.cardEyebrowStart'),
      storyTitle: creatorT(locale, 'creator.home.storyBegin'),
      storyMeta: creatorT(locale, 'creator.home.storyMetaNone'),
      progressLabel: creatorT(locale, 'creator.home.progressNone'),
      progressWidth: '8%',
    };
  }
  const count = memoryCount(tribute);
  const readyCount = readyMemoryCount(tribute);
  const ready = tribute.firstFilmStage === 'ready_to_review';
  return {
    hero: creatorT(locale, 'creator.home.hero'),
    lede: `${creatorT(locale, 'creator.home.ledeContinue')}${savedLine}`,
    cardEyebrow: creatorT(locale, 'creator.home.cardEyebrowActive'),
    storyTitle:
      locale === 'en'
        ? `${possessive(tribute.displayName)} story`
        : creatorT(locale, 'creator.home.storyOf').replace('{name}', tribute.displayName),
    storyMeta:
      readyCount === 0
        ? count === 0
          ? creatorT(locale, 'creator.home.metaFirst')
          : creatorT(locale, 'creator.home.metaPreparing')
        : readyCount === 1
          ? creatorT(locale, 'creator.home.metaFilmOne')
          : creatorT(locale, 'creator.home.metaFilmMany').replace('{count}', String(readyCount)),
    progressLabel: ready
      ? creatorT(locale, 'creator.home.progressReady')
      : creatorT(locale, 'creator.home.progressWaiting'),
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
      primaryLabel: 'Begin setup',
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
    primaryLabel: ready ? '▶  Watch the first film' : 'Add memories',
    posterSrc,
  };
}
