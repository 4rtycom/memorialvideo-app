import { parseTimelineContract, renderKindSchema, type TimelineContract } from '@memorialvideo/contracts';

export type SnapshotFile = {
  kind: 'preview' | 'final' | 'fallback';
  timeline: TimelineContract;
};

export function parseSnapshotFile(raw: string): SnapshotFile {
  const parsed = JSON.parse(raw) as { kind?: unknown; timeline?: unknown; spec?: { kind?: unknown; timeline?: unknown } };
  const kind = renderKindSchema.parse(parsed.kind ?? parsed.spec?.kind ?? 'preview');
  const timeline = parseTimelineContract(parsed.timeline ?? parsed.spec?.timeline);
  return { kind, timeline };
}
