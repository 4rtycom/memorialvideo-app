import Image from 'next/image';
import Link from 'next/link';
import { BrandWordmark } from '@/components/BrandWordmark';
import { mobileHomeCopy, shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

/** Aligns with family primary nav (§4); Invite lives inside Memories. */
const tabs = [
  ['/', '⌂', 'Overview'],
  ['/memories', '▦', 'Memories'],
  ['/music', '♫', 'Music'],
  ['/film', '▷', 'Your Film'],
  ['/share', '↓', 'Service'],
] as const;

export default async function MobileHomePage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const copy = mobileHomeCopy(tribute);

  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <BrandWordmark alt={shell.brand} className="brand-wordmark brand-wordmark--mobile" />
        <div className="text-[21px]" aria-hidden>
          ☰
        </div>
      </header>
      <main className="px-6 pt-8">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="serif text-[47px] leading-[1.02] m-0 mb-4">
          {copy.heroLine1}
          <br />
          {copy.heroLine2}
        </h1>
        <p className="text-[14px] text-[color:var(--muted)] mb-8">{copy.meta}</p>
        <div className="relative h-[255px] rounded-[10px] overflow-hidden">
          <Image src={copy.posterSrc} alt="" fill className="object-cover" sizes="342px" />
        </div>
        <div className="bg-[color:var(--primary)] text-white rounded-[8px] px-4 py-4 -mt-1 relative">
          <div className="serif text-[31px] leading-none">{copy.filmTitle}</div>
        </div>
        <Link href={copy.primaryHref} className="btn btn-primary btn-block mt-6">
          {copy.primaryLabel}
        </Link>
        <p className="text-center font-medium text-[13px] mt-6 mb-0">
          {tribute ? (
            <>
              <Link href="/memories">Add memories</Link>
              {'    ·    '}
              <Link href="/contributors">Invite loved ones</Link>
            </>
          ) : (
            <>
              <Link href="/setup">Begin setup</Link>
              {'    ·    '}
              <Link href="/workspace">Open workspace</Link>
            </>
          )}
        </p>
      </main>
      <nav className="mobile-nav" aria-label="Mobile">
        {tabs.map(([href, icon, label]) => (
          <Link key={href} href={href}>
            <span className="icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
