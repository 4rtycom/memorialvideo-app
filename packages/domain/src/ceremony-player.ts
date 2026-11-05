import {
  formatTimelineClock,
  sceneStartFrame,
  totalDurationFrames,
  type CeremonySpeechPause,
  type MusicDirectorSlotId,
  type TimelineContract,
} from '@memorialvideo/contracts';

import { resolveMomentFrameRanges, type MomentFrameRange } from './ceremony-music';

/** Map Music Director slots onto ceremony music moment ranges. */
const SLOT_TO_MOMENT: Record<MusicDirectorSlotId, keyof ReturnType<typeof resolveMomentFrameRanges>> = {
  opening: 'opening',
  memories: 'tribute',
  farewell: 'closing',
};

export type CeremonyCueKind = 'chapter' | 'speech_pause';

export type CeremonyRunningOrderItem = {
  id: string;
  kind: CeremonyCueKind;
  title: string;
  startFrame: number;
  startLabel: string;
  waitingNote?: string;
  /** Interactive player auto-stops here for live words. */
  autoPause: boolean;
};

/**
 * Frame where a speech pause waits: after the named music slot finishes,
 * or at 0 when the pause is before Opening.
 */
export function resolveSpeechPauseFrame(
  timeline: TimelineContract,
  afterSlot: MusicDirectorSlotId | null,
): number {
  const total = totalDurationFrames(timeline);
  if (!afterSlot) {
    return 0;
  }
  const ranges = resolveMomentFrameRanges(timeline);
  const moment = SLOT_TO_MOMENT[afterSlot];
  const range: MomentFrameRange | null = ranges[moment] ?? null;
  if (!range) {
    return Math.max(0, total - 1);
  }
  // Hold on the last frame of the moment so the still is stable for the operator.
  return Math.max(0, Math.min(total - 1, range.endFrame - 1));
}

export function buildCeremonyRunningOrder(input: {
  timeline: TimelineContract;
  speechPauses?: readonly CeremonySpeechPause[] | null;
}): CeremonyRunningOrderItem[] {
  const { timeline } = input;
  const items: CeremonyRunningOrderItem[] = [];

  for (const scene of timeline.scenes) {
    if (scene.type !== 'chapter') continue;
    const startFrame = sceneStartFrame(timeline, scene.id);
    items.push({
      id: scene.id,
      kind: 'chapter',
      title: scene.title,
      startFrame,
      startLabel: formatTimelineClock(startFrame, timeline.fps),
      autoPause: false,
    });
  }

  const pauses = (input.speechPauses ?? []).filter((pause) => pause.enabled);
  for (const pause of pauses) {
    const startFrame = resolveSpeechPauseFrame(timeline, pause.afterSlot);
    items.push({
      id: pause.id,
      kind: 'speech_pause',
      title: pause.label,
      startFrame,
      startLabel: formatTimelineClock(startFrame, timeline.fps),
      waitingNote: pause.waitingNote || undefined,
      autoPause: true,
    });
  }

  items.sort((a, b) => {
    if (a.startFrame !== b.startFrame) return a.startFrame - b.startFrame;
    // Speech holds after a chapter at the same clock should list after the chapter.
    if (a.kind === b.kind) return a.id.localeCompare(b.id);
    return a.kind === 'chapter' ? -1 : 1;
  });

  return items;
}

/** Next auto-pause frame strictly after `fromFrame` (exclusive). */
export function nextAutoPauseFrame(
  order: readonly CeremonyRunningOrderItem[],
  fromFrame: number,
): number | null {
  const next = order.find((item) => item.autoPause && item.startFrame > fromFrame);
  return next?.startFrame ?? null;
}

export function ceremonyRunningOrderForCueSheet(
  order: readonly CeremonyRunningOrderItem[],
): Array<{ title: string; startLabel: string }> {
  return order.map((item) => ({
    title:
      item.kind === 'speech_pause'
        ? `⏸ Live words — ${item.title}${item.waitingNote ? ` (${item.waitingNote})` : ''}`
        : item.title,
    startLabel: item.startLabel,
  }));
}
