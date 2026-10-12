import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator local store', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-'));
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

  it('creates opaque tributes that survive reload', async () => {
    const store = await import('./store');
    const created = await store.createTribute({
      displayName: 'Ada Lovelace',
      bornLabel: '1815',
      rememberedLabel: '1852',
      about: 'Mathematician',
      ownerInitial: 'A',
    });
    expect(created.publicId).toMatch(/^mv_[a-f0-9]{16}$/i);
    expect(created.isFixtureSeed).toBe(false);
    expect(created.entitlement).toBeNull();

    const reloaded = await store.getTribute(created.publicId);
    expect(reloaded?.displayName).toBe('Ada Lovelace');
    expect(reloaded?.about).toBe('Mathematician');
  });

  it('starts memories uploading and advances durable ingest jobs', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Test Person' });
    const memory = await store.addMemory(created.publicId, {
      title: 'Garden afternoon',
      year: '1990',
      imagePath: '/fixtures/memory-c.png',
      filename: 'garden.jpg',
    });
    expect(memory?.ingestStatus).toBe('UPLOADING');

    let status = memory!.ingestStatus;
    for (let i = 0; i < 8 && status !== 'READY'; i += 1) {
      const step = await store.advanceIngestJobs(created.publicId);
      expect(step.advanced).toBeGreaterThan(0);
      status = step.tribute!.memories[0]!.ingestStatus;
    }
    expect(status).toBe('READY');
    expect(store.hasInFlightIngest((await store.getTribute(created.publicId))!)).toBe(false);
  });

  it('rejects HEIC with honest needs_attention and no retry path', async () => {
    const store = await import('./store');
    const ingest = await import('./ingest');
    const created = await store.createTribute({ displayName: 'Heic Person' });
    const memory = await store.addMemory(created.publicId, {
      title: 'Phone photo',
      filename: 'IMG_001.HEIC',
      imagePath: '/fixtures/memory-a.png',
    });
    expect(memory?.ingestStatus).toBe('REJECTED');
    expect(memory?.failureCode).toBe('heic');
    const view = ingest.memoryView({
      ingestStatus: memory!.ingestStatus,
      failureCode: memory!.failureCode,
    });
    expect(view.uiStatus).toBe('needs_attention');
    const retry = await store.retryFailedMemory(created.publicId, memory!.id);
    expect(retry).toBeNull();
  });

  it('grants Memorial Pack only via local_fake when APP_ENV=local', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Pack Person' });
    const granted = await store.fulfillLocalMemorialPack(created.publicId);
    expect(granted.ok).toBe(true);
    if (!granted.ok) {
      return;
    }
    expect(granted.tribute.entitlement?.packageKey).toBe('ceremony');
    expect(granted.tribute.entitlement?.source).toBe('local_fake');
    const view = store.entitlementView(granted.tribute);
    expect(view.active).toBe(true);
    expect(view.allowsPrivatePlayback).toBe(true);

    process.env.APP_ENV = 'production';
    vi.resetModules();
    const prodStore = await import('./store');
    const other = await prodStore.createTribute({ displayName: 'Blocked' });
    const blocked = await prodStore.fulfillLocalMemorialPack(other.publicId);
    expect(blocked).toEqual({ ok: false, reason: 'not_local' });
  });

  it('seeds Eleanor only as an explicit local fixture with TimelineContract', async () => {
    const store = await import('./store');
    const seeded = await store.seedEleanorFixture();
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) {
      return;
    }
    expect(seeded.tribute.isFixtureSeed).toBe(true);
    expect(seeded.tribute.displayName).toContain('Eleanor');
    expect(seeded.tribute.memories.length).toBeGreaterThan(0);
    expect(seeded.tribute.timeline).toBeTruthy();
    expect(seeded.tribute.timeline?.schemaVersion).toBe(1);
    expect(seeded.tribute.timeline?.scenes.length).toBeGreaterThan(2);

    process.env.APP_ENV = 'staging';
    vi.resetModules();
    const stagingStore = await import('./store');
    const denied = await stagingStore.seedEleanorFixture();
    expect(denied).toEqual({ ok: false, reason: 'not_local' });
  });

  it('publishes TimelineContract when first-film reaches ready_to_review', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Film Person' });
    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD; i += 1) {
      await store.addMemory(created.publicId, {
        title: `M${i}`,
        year: '2000',
        filename: `m${i}.jpg`,
        alreadyReady: true,
      });
    }
    let stage = 'preparing_memories';
    for (let i = 0; i < 6 && stage !== 'ready_to_review'; i += 1) {
      const step = await store.advanceFirstFilm(created.publicId);
      expect(step.ok).toBe(true);
      if (!step.ok) {
        return;
      }
      stage = step.stage;
    }
    expect(stage).toBe('ready_to_review');
    const tribute = await store.getTribute(created.publicId);
    expect(tribute?.timeline?.displayName).toBe('Film Person');
    expect(tribute?.timeline?.fps).toBe(30);
    expect(tribute?.timeline?.scenes.some((s) => s.type === 'image')).toBe(true);
  });
});
