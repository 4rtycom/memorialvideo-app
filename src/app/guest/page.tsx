import { GuestContribute } from '@/components/GuestContribute';

export default function GuestLandingPage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <div className="font-medium text-[21px]">memorialvideo</div>
        <div className="text-[11px] text-[color:var(--muted)]">Private contribution</div>
      </header>
      <GuestContribute />
    </div>
  );
}
