import Link from 'next/link';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { creatorT } from '@/lib/creator-ui-messages';

/** Guided film destinations nested under Your Film; Advanced Studio stays optional. */
export function FilmFamilyActions({
  locale,
  hasTimeline,
}: {
  locale: LaunchLanguage;
  hasTimeline: boolean;
}) {
  return (
    <div className="film-family-actions mt-8">
      <div className="flex flex-wrap gap-3">
        {!hasTimeline ? (
          <Link className="btn btn-secondary" href="/film/creating">
            {creatorT(locale, 'creator.film.arrange')}
          </Link>
        ) : null}
        <Link className="btn btn-secondary" href="/film/edit">
          {creatorT(locale, 'creator.film.edit')}
        </Link>
        <Link className="btn btn-secondary" href="/life-story">
          {creatorT(locale, 'creator.nav.lifeStory')}
        </Link>
        <Link className="btn btn-secondary" href="/film/styles">
          {creatorT(locale, 'creator.nav.styles')}
        </Link>
        <Link className="btn btn-secondary" href="/share">
          {creatorT(locale, 'creator.film.share')}
        </Link>
      </div>

      <details className="film-advanced mt-5" data-testid="film-advanced-optional">
        <summary className="film-advanced-summary">
          {creatorT(locale, 'creator.nav.advanced')}
        </summary>
        <div className="flex flex-wrap gap-3 mt-3">
          <Link className="btn btn-secondary" href="/film/studio">
            {creatorT(locale, 'creator.nav.advancedStudio')}
          </Link>
          <Link className="btn btn-secondary" href="/film/enhance">
            {creatorT(locale, 'creator.nav.enhance')}
          </Link>
          <Link className="btn btn-secondary" href="/ceremony">
            Ceremony Player
          </Link>
        </div>
      </details>
    </div>
  );
}
