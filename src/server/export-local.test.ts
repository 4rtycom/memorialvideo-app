import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineContract } from '@memorialvideo/contracts';
import { sanitizeTimelineForExport } from './export-local';

describe('sanitizeTimelineForExport', () => {
  it('strips media srcs and captions from scenes', () => {
    const timeline = {
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 42,
      locale: 'en',
      themeKey: 'timeless',
      watermark: false,
      displayName: 'Fixture Person',
      scenes: [
        {
          id: 'sc_intro',
          type: 'intro',
          durationFrames: 90,
          transition: 'fade',
          title: 'In memory',
        },
        {
          id: 'sc_img',
          type: 'image',
          durationFrames: 150,
          transition: 'dissolve',
          caption: 'Private caption must not appear',
          asset: { id: 'asset_1', src: 'storage://projects/x/secret.jpg' },
        },
      ],
      audio: {
        schemaVersion: 1,
        masterGain: 1,
        clips: [],
        duckingRegions: [],
        subtitleTracks: [],
      },
    } as unknown as TimelineContract;

    const sanitized = sanitizeTimelineForExport(timeline);
    expect(sanitized.items).toEqual([
      { position: 0, itemType: 'intro', durationFrames: 90 },
      { position: 1, itemType: 'image', durationFrames: 150 },
    ]);
    expect(sanitized.hasAudioMix).toBe(true);
    expect(JSON.stringify(sanitized)).not.toContain('Private caption');
    expect(JSON.stringify(sanitized)).not.toContain('storage://');
    expect(JSON.stringify(sanitized)).not.toContain('Fixture Person');
  });

  it('returns empty items when timeline is null', () => {
    expect(sanitizeTimelineForExport(null).items).toEqual([]);
  });
});

describe('exportOwnerTributeMetadata', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-export-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it('denies export without Memorial Pack entitlement', async () => {
    const store = await import('./store');
    const exp = await import('./export-local');
    const created = await store.createTribute({ displayName: 'Export Person' });
    const denied = exp.exportOwnerTributeMetadata(created);
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error).toBe('no_entitlement');
    expect(denied.status).toBe(403);
  });

  it('builds a metadata ZIP with domain manifest and no media paths', async () => {
    const store = await import('./store');
    const exp = await import('./export-local');
    const created = await store.createTribute({ displayName: 'Export Person' });
    await store.fulfillLocalMemorialPack(created.publicId);
    const withPack = await store.getTribute(created.publicId);
    const result = exp.exportOwnerTributeMetadata(withPack);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toMatch(/^mv_.*-export\.zip$/);
    expect(result.bytes[0]).toBe(0x50);
    expect(result.bytes[1]).toBe(0x4b);
    const asText = new TextDecoder().decode(result.bytes);
    expect(asText).toContain('manifest.json');
    expect(asText).toContain('timeline.json');
    expect(asText).toContain('summary.json');
    expect(asText).toContain('source_binaries');
    expect(asText).toContain('render_outputs');
    expect(asText).not.toContain('Export Person');
  });
});
