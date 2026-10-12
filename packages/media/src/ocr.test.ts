import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runLocalOcr } from './ocr';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../test-utils/fixtures/content-extraction/ocr-card.jpg',
);

describe('local OCR', () => {
  it('reads printed synthetic card text with tesseract.js when fixture exists', async () => {
    if (!existsSync(fixture)) {
      return;
    }
    const bytes = new Uint8Array(readFileSync(fixture));
    const result = await runLocalOcr({ bytes, assetId: 'fixture' });
    expect(result.engineName).toBe('tesseract.js');
    expect(result.fullText.length + result.blocks.length).toBeGreaterThan(0);
    expect(result.fullText.toUpperCase()).toMatch(/ROTTERDAM|1972|MAY/);
    for (const block of result.blocks) {
      if (!block.bbox) {
        continue;
      }
      expect(block.bbox.x).toBeGreaterThanOrEqual(0);
      expect(block.bbox.y).toBeGreaterThanOrEqual(0);
      expect(block.bbox.width).toBeGreaterThanOrEqual(0);
      expect(block.bbox.height).toBeGreaterThanOrEqual(0);
      expect(block.bbox.x).toBeLessThanOrEqual(1);
      expect(block.bbox.y).toBeLessThanOrEqual(1);
      expect(block.bbox.width).toBeLessThanOrEqual(1);
      expect(block.bbox.height).toBeLessThanOrEqual(1);
    }
  }, 120_000);
});
