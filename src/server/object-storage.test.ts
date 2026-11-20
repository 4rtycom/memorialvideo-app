import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageApi = {
  createBucket: vi.fn(),
  from: vi.fn(),
};
const bucketApi = {
  createSignedUploadUrl: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ storage: storageApi }),
}));

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-value',
};

async function load() {
  return import('./object-storage');
}

beforeEach(() => {
  vi.resetModules();
  Object.assign(process.env, ENV);
  delete process.env.MEDIA_BACKEND;
  delete process.env.SUPABASE_MEDIA_BUCKET;
  storageApi.createBucket.mockReset().mockResolvedValue({ error: null });
  storageApi.from.mockReset().mockReturnValue(bucketApi);
  for (const fn of Object.values(bucketApi)) fn.mockReset();
});

describe('mediaBackend', () => {
  it('uses supabase outside local, local disk in local, and honours overrides', async () => {
    const { mediaBackend } = await load();
    const { creatorEnv } = await import('./env');
    expect(mediaBackend(creatorEnv({ ...process.env, APP_ENV: 'production' }))).toBe('supabase');
    expect(mediaBackend(creatorEnv({ ...process.env, APP_ENV: 'local' }))).toBe('local');
    process.env.MEDIA_BACKEND = 'supabase';
    expect(mediaBackend(creatorEnv({ ...process.env, APP_ENV: 'local' }))).toBe('supabase');
    process.env.MEDIA_BACKEND = 'local';
    expect(mediaBackend(creatorEnv({ ...process.env, APP_ENV: 'production' }))).toBe('local');
  });

  it('falls back to local when Supabase is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { mediaBackend } = await load();
    const { creatorEnv } = await import('./env');
    expect(mediaBackend(creatorEnv({ ...process.env, APP_ENV: 'production' }))).toBe('local');
  });
});

describe('object storage', () => {
  it('creates a private bucket once and returns a signed upload for tribute/asset', async () => {
    bucketApi.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/x?token=t', token: 't', path: 'p' },
      error: null,
    });
    const { createSignedUpload } = await load();
    const first = await createSignedUpload('mv_aaaaaaaaaaaaaaaa', 'mem_1');
    await createSignedUpload('mv_aaaaaaaaaaaaaaaa', 'mem_2');
    expect(first).toEqual({
      signedUrl: 'https://example.supabase.co/x?token=t',
      token: 't',
      path: 'mv_aaaaaaaaaaaaaaaa/mem_1',
    });
    expect(storageApi.createBucket).toHaveBeenCalledTimes(1);
    expect(storageApi.createBucket).toHaveBeenCalledWith('memories', expect.objectContaining({ public: false }));
    expect(bucketApi.createSignedUploadUrl).toHaveBeenCalledWith('mv_aaaaaaaaaaaaaaaa/mem_1');
  });

  it('tolerates an existing bucket but surfaces other bucket errors', async () => {
    storageApi.createBucket.mockResolvedValueOnce({ error: { message: 'The resource already exists' } });
    bucketApi.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'u', token: 't', path: 'p' }, error: null });
    const { createSignedUpload, resetObjectStorageForTests } = await load();
    await expect(createSignedUpload('mv_aaaaaaaaaaaaaaaa', 'mem_1')).resolves.toBeTruthy();
    resetObjectStorageForTests();
    storageApi.createBucket.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(createSignedUpload('mv_aaaaaaaaaaaaaaaa', 'mem_1')).rejects.toThrow('bucket_unavailable');
  });

  it('downloads bytes, returns null when missing', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    bucketApi.download.mockResolvedValueOnce({ data: blob, error: null });
    bucketApi.download.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    const { downloadObject } = await load();
    const found = await downloadObject('mv_aaaaaaaaaaaaaaaa', 'mem_1');
    expect(found?.bytes.equals(Buffer.from([1, 2, 3]))).toBe(true);
    expect(found?.contentType).toBe('image/jpeg');
    expect(await downloadObject('mv_aaaaaaaaaaaaaaaa', 'mem_2')).toBeNull();
  });

  it('removes every object of a tribute across pages', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `mem_${i}` }));
    bucketApi.list
      .mockResolvedValueOnce({ data: page(100), error: null })
      .mockResolvedValueOnce({ data: page(3), error: null })
      .mockResolvedValueOnce({ data: page(2), error: null }); // renders bucket
    bucketApi.remove.mockResolvedValue({ error: null });
    const { removeTributeObjects } = await load();
    expect(await removeTributeObjects('mv_aaaaaaaaaaaaaaaa')).toBe(105);
    expect(bucketApi.remove.mock.calls[0]?.[0][0]).toBe('mv_aaaaaaaaaaaaaaaa/mem_0');
  });
});
