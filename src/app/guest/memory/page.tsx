import Link from 'next/link';
import { GuestShell } from '@/components/GuestShell';
import { project } from '@/lib/copy';
import { creatorT } from '@/lib/creator-ui-messages';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';

export default async function GuestMemoryPage() {
  const locale = await resolveCreatorLocaleWithTribute(null);

  return (
    <GuestShell
      brand={project.brand}
      meta={creatorT(locale, 'creator.guest.meta')}
      skipLabel={creatorT(locale, 'creator.a11y.skip')}
    >
      <main id="main" className="guest-main px-6 pt-8" tabIndex={-1}>
        <p className="eyebrow">{creatorT(locale, 'creator.guest.memoryEyebrow')}</p>
        <h1 className="serif text-[42px] leading-[1.05] m-0 mb-4">
          {creatorT(locale, 'creator.guest.memoryHero')}
        </h1>
        <p className="text-[color:var(--muted)] mb-6">{creatorT(locale, 'creator.guest.memoryLede')}</p>
        <label className="block font-medium mb-2" htmlFor="guest-first-name">
          {creatorT(locale, 'creator.guest.firstName')}
        </label>
        <input
          id="guest-first-name"
          className="field mb-5"
          placeholder="Sophie"
          defaultValue="Sophie"
          autoComplete="given-name"
        />
        <label className="block font-medium mb-2" htmlFor="guest-note">
          {creatorT(locale, 'creator.guest.note')}
        </label>
        <textarea
          id="guest-note"
          className="field textarea mb-8"
          defaultValue="Eleanor’s favourite park — a quiet afternoon in the sun."
        />
        <Link href="/guest/thanks" className="btn btn-primary btn-block">
          {creatorT(locale, 'creator.guest.sendContribution')}
        </Link>
      </main>
    </GuestShell>
  );
}
