import Link from 'next/link';
import { GuestShell } from '@/components/GuestShell';
import { project } from '@/lib/copy';
import { creatorT } from '@/lib/creator-ui-messages';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';

export default async function GuestUploadPage() {
  const locale = await resolveCreatorLocaleWithTribute(null);

  return (
    <GuestShell
      brand={project.brand}
      meta={creatorT(locale, 'creator.guest.meta')}
      skipLabel={creatorT(locale, 'creator.a11y.skip')}
    >
      <main id="main" className="guest-main px-6 pt-8" tabIndex={-1}>
        <p className="eyebrow">{creatorT(locale, 'creator.guest.uploadEyebrow')}</p>
        <h1 className="serif text-[42px] leading-[1.05] m-0 mb-4">
          {creatorT(locale, 'creator.guest.uploadHero')}
        </h1>
        <p className="text-[color:var(--muted)] mb-8">{creatorT(locale, 'creator.guest.uploadLede')}</p>
        <div className="card mb-4 !p-6">
          <div className="text-[35px] text-[color:var(--accent)] mb-2">＋</div>
          <div className="font-medium text-[20px] mb-1">{creatorT(locale, 'creator.guest.uploadChoose')}</div>
          <p className="text-[13px] text-[color:var(--muted)] m-0">
            {creatorT(locale, 'creator.guest.uploadFormats')}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-8">
          {['/fixtures/memory-a.png', '/fixtures/memory-d.png', '/fixtures/memory-e.png'].map((src) => (
            <img key={src} src={src} alt="" className="h-[96px] w-full object-cover rounded-[10px]" />
          ))}
        </div>
        <Link href="/guest/memory" className="btn btn-primary btn-block">
          {creatorT(locale, 'creator.common.continue')}
        </Link>
      </main>
    </GuestShell>
  );
}
