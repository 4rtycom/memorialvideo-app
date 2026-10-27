import Link from "next/link";
import { BrandWordmark } from "@/components/BrandWordmark";
import { project } from "@/lib/copy";

export default function GuestMemoryPage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <BrandWordmark alt={project.brand} className="brand-wordmark brand-wordmark--mobile" />
        <div className="text-[11px] text-[color:var(--muted)]">Private contribution</div>
      </header>
      <main className="px-6 pt-8">
        <p className="eyebrow">OPTIONAL NOTE</p>
        <h1 className="serif text-[42px] leading-[1.05] m-0 mb-4">Tell us about a memory.</h1>
        <p className="text-[color:var(--muted)] mb-6">A few words help the family place this moment in the story.</p>
        <label className="block font-medium mb-2">Your first name</label>
        <input className="field mb-5" placeholder="Sophie" defaultValue="Sophie" />
        <label className="block font-medium mb-2">A short note (optional)</label>
        <textarea className="field textarea mb-8" defaultValue="Eleanor’s favourite park — a quiet afternoon in the sun." />
        <Link href="/guest/thanks" className="btn btn-primary btn-block">Send contribution  ↗</Link>
      </main>
    </div>
  );
}
