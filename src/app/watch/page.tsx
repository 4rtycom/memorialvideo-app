import { PrivateWatch } from '@/components/PrivateWatch';

export default function WatchPage() {
  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--ink)]">
      <header className="px-6 py-4 border-b border-[color:var(--border)] flex justify-between items-center">
        <div className="font-medium text-[18px]">memorialvideo</div>
        <div className="text-[12px] text-[color:var(--muted)]">Private screening</div>
      </header>
      <PrivateWatch />
    </div>
  );
}
