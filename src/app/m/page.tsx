import Image from "next/image";
import Link from "next/link";
import { project } from "@/lib/copy";

const tabs = [
  ["/", "⌂", "Home"],
  ["/memories", "▦", "Memories"],
  ["/film", "▷", "Film"],
  ["/contributors", "♧", "Invite"],
  ["/share", "↓", "Share"],
];

export default function MobileHomePage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <div className="font-medium text-[21px]">{project.brand}</div>
        <div className="text-[21px]" aria-hidden>☰</div>
      </header>
      <main className="px-6 pt-8">
        <p className="eyebrow">ELEANOR’S PERSONAL WORKSPACE</p>
        <h1 className="serif text-[47px] leading-[1.02] m-0 mb-4">Her story is ready<br />to watch.</h1>
        <p className="text-[14px] text-[color:var(--muted)] mb-8">48 memories collected  ·  First film ready</p>
        <div className="relative h-[255px] rounded-[10px] overflow-hidden">
          <Image src="/fixtures/mobile-portrait.png" alt="" fill className="object-cover" sizes="342px" />
        </div>
        <div className="bg-[color:var(--primary)] text-white rounded-[8px] px-4 py-4 -mt-1 relative">
          <div className="serif text-[31px] leading-none">{project.title}</div>
        </div>
        <Link href="/film" className="btn btn-primary btn-block mt-6">▶  Watch the first film</Link>
        <p className="text-center font-medium text-[13px] mt-6 mb-0">
          <Link href="/memories">Add memories</Link>
          {"    ·    "}
          <Link href="/contributors">Invite loved ones</Link>
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
