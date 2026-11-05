import Link from 'next/link';
import { GuestShell } from '@/components/GuestShell';
import { project } from '@/lib/copy';

export default function GuestMemoryPage() {
  return (
    <GuestShell brand={project.brand}>
      <main id="main" className="guest-main px-6 pt-8" tabIndex={-1}>
        <p className="eyebrow">OPTIONAL NOTE</p>
        <h1 className="serif text-[42px] leading-[1.05] m-0 mb-4">Tell us about a memory.</h1>
        <p className="text-[color:var(--muted)] mb-6">
          A few words help the family place this moment in the story.
        </p>
        <label className="block font-medium mb-2" htmlFor="guest-first-name">
          Your first name
        </label>
        <input
          id="guest-first-name"
          className="field mb-5"
          placeholder="Sophie"
          defaultValue="Sophie"
          autoComplete="given-name"
        />
        <label className="block font-medium mb-2" htmlFor="guest-note">
          A short note (optional)
        </label>
        <textarea
          id="guest-note"
          className="field textarea mb-8"
          defaultValue="Eleanor’s favourite park — a quiet afternoon in the sun."
        />
        <Link href="/guest/thanks" className="btn btn-primary btn-block">
          Send contribution  ↗
        </Link>
      </main>
    </GuestShell>
  );
}
