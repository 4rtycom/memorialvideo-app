import { describe, expect, it } from 'vitest';

import { posterExtractProps } from './PosterExtract';

describe('h264 poster extract', () => {
  it('passes a bundled public path and denies remote sources', () => {
    const props = posterExtractProps('extract/worker-smoke-timeless.mp4');
    expect(props.src).toBe('extract/worker-smoke-timeless.mp4');
    expect(() => posterExtractProps('https://example.test/clip.mp4')).toThrow('remote_src_denied');
    expect(() => posterExtractProps('file:///C:/tmp/clip.mp4')).toThrow('remote_src_denied');
  });
});
