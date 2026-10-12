import { describe, expect, it } from 'vitest';

import { createGoldenTimeline } from './timelines';
import { parseSnapshotFile } from './snapshot-render';

describe('snapshot render file', () => {
  it('reads a domain-style snapshot payload', () => {
    const file = parseSnapshotFile(
      JSON.stringify({
        kind: 'preview',
        timeline: createGoldenTimeline(true),
      }),
    );
    expect(file.kind).toBe('preview');
    expect(file.timeline.watermark).toBe(true);
    expect(file.timeline.scenes.length).toBeGreaterThan(1);
  });

  it('rejects a final snapshot that still carries a watermarked contract at the composition door', () => {
    expect(() => parseSnapshotFile(JSON.stringify({ kind: 'nope', timeline: createGoldenTimeline(true) }))).toThrow();
  });
});
