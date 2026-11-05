import Link from 'next/link';
import { GuestShell } from '@/components/GuestShell';
import { project } from '@/lib/copy';
import { creatorT } from '@/lib/creator-ui-messages';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';

export default async function GuestThanksPage() {
  const locale = await resolveCreatorLocaleWithTribute(null);

  return (
    <GuestShell
      brand={project.brand}
      meta={creatorT(locale, 'creator.guest.meta')}
      skipLabel={creatorT(locale, 'creator.a11y.skip')}
    >
      <main id="main" className="guest-main px-6 pt-16 text-center" tabIndex={-1}>
        <p className="eyebrow">{creatorT(locale, 'creator.guest.thanksEyebrow')}</p>
        <h1 className="serif text-[46px] leading-[1.05] m-0 mb-5">
          {creatorT(locale, 'creator.guest.received')}
        </h1>
        <p className="text-[color:var(--muted)] mb-10">{creatorT(locale, 'creator.guest.review')}</p>
        <div className="card soft !p-6 mb-8 text-left">
          <div className="serif text-[28px] mb-2">{creatorT(locale, 'creator.guest.held')}</div>
          <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.guest.privateNote')}</p>
        </div>
        <Link href="/guest" className="btn btn-secondary btn-block">
          {creatorT(locale, 'creator.guest.done')}
        </Link>
      </main>
    </GuestShell>
  );
}
