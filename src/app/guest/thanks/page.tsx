import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";
import { project } from "@/lib/copy";

export default function GuestThanksPage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <BrandWordmark alt={project.brand} className="brand-wordmark brand-wordmark--mobile" />
        <div className="text-[11px] text-[color:var(--muted)]">Private contribution</div>
      </header>
      <main className="px-6 pt-16 text-center">
        <p className="eyebrow">THANK YOU</p>
        <h1 className="serif text-[46px] leading-[1.05] m-0 mb-5">Your memory has been received.</h1>
        <p className="text-[color:var(--muted)] mb-10">
          The family will review it privately before anything is added to the film.
        </p>
        <div className="card soft !p-6 mb-8 text-left">
          <div className="serif text-[28px] mb-2">Gently held.</div>
          <p className="text-[color:var(--muted)] m-0">Nothing is published. Nothing is shared without the owner’s approval.</p>
        </div>
        <Link href="/guest" className="btn btn-secondary btn-block">Done</Link>
      </main>
    </div>
  );
}
