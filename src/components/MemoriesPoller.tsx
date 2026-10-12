'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Poll advances durable ingest jobs one step — no client setTimeout fake READY. */
export function MemoriesPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch('/api/tributes/active/memories?advanceJobs=1', {
          cache: 'no-store',
        });
        if (!cancelled && response.ok) {
          const body = (await response.json()) as { advanced?: number };
          if ((body.advanced ?? 0) > 0) {
            router.refresh();
          }
        }
      } catch {
        // retry on next interval
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, router]);

  return null;
}
