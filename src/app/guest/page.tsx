import { BrandWordmark } from '@/components/BrandWordmark';
import { GuestContribute } from '@/components/GuestContribute';

export default function GuestLandingPage() {
  return (
    <div className="mobile-shell">
      <header className="mobile-top">
        <BrandWordmark className="brand-wordmark brand-wordmark--mobile" />
        <div className="text-[11px] text-[color:var(--muted)]">Private contribution</div>
      </header>
      <GuestContribute />
    </div>
  );
}
