import { describe, expect, it } from 'vitest';
import {
  MAX_STILL_EDGE_PX,
  buildStillNormalizeFilter,
  normalizedStillAbsolutePath,
} from './normalize-still';

describe('still ingest normalize', () => {
  it('caps the long edge with lanczos scale', () => {
    const vf = buildStillNormalizeFilter(1920);
    expect(vf).toContain('1920');
    expect(vf).toContain('flags=lanczos');
    expect(vf).toContain('setsar=1');
  });

  it('uses ceremony-friendly default max edge', () => {
    expect(MAX_STILL_EDGE_PX).toBe(2560);
    expect(buildStillNormalizeFilter()).toContain(String(MAX_STILL_EDGE_PX));
  });

  it('places normalized sibling beside the raw media object', () => {
    expect(normalizedStillAbsolutePath('/tmp/media/mv_x/mem_y')).toBe(
      '/tmp/media/mv_x/mem_y.normalized.jpg',
    );
  });
});
