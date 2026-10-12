import Link from "next/link";
import { project } from "@/lib/copy";

export default function GuestUploadPage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <div className="font-medium text-[21px]">{project.brand}</div>
        <div className="text-[11px] text-[color:var(--muted)]">Private contribution</div>
      </header>
      <main className="px-6 pt-8">
        <p className="eyebrow">CHOOSE WHAT TO SHARE</p>
        <h1 className="serif text-[42px] leading-[1.05] m-0 mb-4">Photos and little videos.</h1>
        <p className="text-[color:var(--muted)] mb-8">Select a few moments from your device. You can add a note next.</p>
        <div className="card mb-4 !p-6">
          <div className="text-[35px] text-[color:var(--accent)] mb-2">＋</div>
          <div className="font-medium text-[20px] mb-1">Choose photos & videos</div>
          <p className="text-[13px] text-[color:var(--muted)] m-0">JPG, PNG, HEIC, MP4 · private upload</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-8">
          {["/fixtures/memory-a.png", "/fixtures/memory-d.png", "/fixtures/memory-e.png"].map((src) => (
            <img key={src} src={src} alt="" className="h-[96px] w-full object-cover rounded-[10px]" />
          ))}
        </div>
        <Link href="/guest/memory" className="btn btn-primary btn-block">Continue  ↗</Link>
      </main>
    </div>
  );
}
