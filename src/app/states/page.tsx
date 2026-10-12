import { Button, Eyebrow, Hero, Lede } from "@/components/ui";
import Link from "next/link";

const states = [
  {
    label: "EMPTY WORKSPACE",
    title: "No memories yet",
    body: "Start with one photograph.",
    cta: "Upload your first memory",
    tone: "success",
  },
  {
    label: "RECOVERABLE UPLOAD",
    title: "Upload interrupted",
    body: "We couldn't finish uploading that file.",
    cta: "Try again  ·  Keep selection",
  },
  {
    label: "NO AUTOMATIC DELETION",
    title: "Potential duplicate",
    body: "This looks similar to a memory you have.",
    cta: "Review both  ·  Keep either",
  },
  {
    label: "PRIVATE SIGNED ACCESS",
    title: "Invitation unavailable",
    body: "This link may have expired or been changed.",
    cta: "Request a new link",
  },
  {
    label: "RESUMABLE PROCESSING",
    title: "Film creation interrupted",
    body: "Your memories are safe. The film can be retried.",
    cta: "Try again  ·  Return later",
  },
  {
    label: "RIGHTS & EXPORT CLARITY",
    title: "Music needs permission",
    body: "Please confirm you can use this track.",
    cta: "Choose other music",
  },
];

export default function StatesPage() {
  return (
    <div className="min-h-screen bg-white px-8 py-12">
      <Link href="/" className="text-[14px] text-[color:var(--muted)]">← Back to creator</Link>
      <Eyebrow>DESIGN STATES / BUILD REQUIREMENTS</Eyebrow>
      <Hero className="!max-w-none !text-[48px]">Calm experiences, even when something goes wrong.</Hero>
      <Lede>Clear next actions, no lost uploads, no silent failures, and no destructive automation.</Lede>
      <div className="state-grid">
        {states.map((s) => (
          <div key={s.label} className={`state-card ${s.tone === "success" ? "success" : ""}`}>
            <div className="text-[11px] font-bold text-[color:var(--accent)] mb-3">{s.label}</div>
            <h2 className="serif text-[30px] m-0 mb-3">{s.title}</h2>
            <p className="text-[color:var(--muted)] mb-6">{s.body}</p>
            <Button>{s.cta}</Button>
          </div>
        ))}
      </div>
      <p className="text-[14px] text-[color:var(--muted)] mt-10 max-w-5xl">
        Implementation rules: autosave and reversible TimelinePatches · Accessible file retry · Owner approval for contributions · No public publishing by default
      </p>
    </div>
  );
}
