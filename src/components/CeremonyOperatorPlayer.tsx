'use client';

import type { CeremonySpeechPause, TimelineContract } from '@memorialvideo/contracts';
import { CeremonyPlayer } from '@/components/CeremonyPlayer';

/**
 * Gate A rehearsal entry — now backs onto the Gate B interactive Ceremony Player.
 */
export function CeremonyOperatorPlayer({
  timeline,
  origin,
  speechPauses = [],
}: {
  timeline: TimelineContract | null;
  origin: string;
  speechPauses?: readonly CeremonySpeechPause[] | null;
}) {
  return (
    <CeremonyPlayer timeline={timeline} origin={origin} speechPauses={speechPauses} compact />
  );
}
