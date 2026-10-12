import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creatorT, CREATOR_UI_KEYS } from '../lib/creator-ui-messages';
import { buildStoreZip } from './zip-store';

describe('creator locale catalogs + ceremony pack zip', () => {
  it('covers all locked launch languages without missing keys', () => {
    for (const language of ['en', 'nl', 'de', 'fr', 'es', 'pt', 'it', 'pl'] as const) {
      for (const key of CREATOR_UI_KEYS) {
        const value = creatorT(language, key);
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toBe(key);
      }
    }
  });

  it('builds a store-only zip with expected entries', () => {
    const zip = buildStoreZip([
      { name: 'manifest.json', data: new TextEncoder().encode('{"ok":true}') },
      { name: 'note.txt', data: new TextEncoder().encode('hello') },
    ]);
    expect(zip.byteLength).toBeGreaterThan(40);
    // Local file header signature
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
  });
});

describe('creator ceremony pack gate', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-pack-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_LOCAL_ENCODER = '1';
    process.env.CREATOR_USE_REMOTION = '0';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.CREATOR_LOCAL_ENCODER;
    delete process.env.CREATOR_USE_REMOTION;
  });

  it('blocks Ceremony Pack until READY final exists', async () => {
    process.chdir(cwd);
    const store = await import('./store');
    const pack = await import('./ceremony-pack-local');
    const created = await store.createTribute({ displayName: 'Pack Person' });
    expect(pack.planCeremonyPack(created).canBuild).toBe(false);
    expect(pack.planCeremonyPack(created).reason).toBe('memorial_pack_required');

    await store.fulfillLocalMemorialPack(created.publicId);
    const withPack = await store.getTribute(created.publicId);
    expect(pack.planCeremonyPack(withPack).reason).toBe('final_ready_required');
  });

  it('allows checklist-only txt without Memorial Pack or READY final', async () => {
    process.chdir(cwd);
    const store = await import('./store');
    const pack = await import('./ceremony-pack-local');
    const created = await store.createTribute({ displayName: 'Checklist Person' });
    expect(pack.planCeremonyPack(created).canBuild).toBe(false);

    const checklist = pack.buildOwnerCeremonyChecklist(created);
    expect(checklist.ok).toBe(true);
    if (!checklist.ok) return;
    expect(checklist.fileName).toMatch(/-playback\.txt$/);
    expect(checklist.text).toContain('Play the MP4 from this folder');
    expect(checklist.text).toContain('ceremony computer');
    expect(pack.buildOwnerCeremonyChecklist(null)).toEqual({ ok: false, reason: 'no_tribute' });
  });
});
