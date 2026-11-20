import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { creatorEnv, type ServerEnv } from '@/server/env';

/**
 * Durable media storage in a private Supabase Storage bucket.
 * Used when the host has no writable disk (Vercel). Local development keeps using `.data/media`.
 *
 * Objects are keyed `${tributePublicId}/${assetId}`. Browsers upload straight to Storage through a
 * short-lived signed upload URL, so file bytes never pass through a size-limited serverless function.
 */

export const MEDIA_BUCKET_DEFAULT = 'memories';
export const RENDER_BUCKET_DEFAULT = 'renders';
export const SIGNED_READ_SECONDS = 120;
export const RENDER_FILE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;

export type ObjectStorageConfig = { url: string; serviceKey: string; bucket: string; renderBucket: string };

export function objectStorageConfig(env: ServerEnv = creatorEnv()): ObjectStorageConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return {
    url,
    serviceKey,
    bucket: process.env.SUPABASE_MEDIA_BUCKET?.trim() || MEDIA_BUCKET_DEFAULT,
    renderBucket: process.env.SUPABASE_RENDER_BUCKET?.trim() || RENDER_BUCKET_DEFAULT,
  };
}

/** Supabase in production-like environments; local disk when APP_ENV=local unless forced. */
export function mediaBackend(env: ServerEnv = creatorEnv()): 'supabase' | 'local' {
  if (!objectStorageConfig(env)) return 'local';
  if (process.env.MEDIA_BACKEND === 'local') return 'local';
  if (process.env.MEDIA_BACKEND === 'supabase') return 'supabase';
  return env.APP_ENV === 'local' ? 'local' : 'supabase';
}

export function objectKey(tributePublicId: string, assetId: string): string {
  return `${tributePublicId}/${assetId}`;
}

let cached: { key: string; client: SupabaseClient } | null = null;
const bucketsReady = new Set<string>();

function client(config: ObjectStorageConfig): SupabaseClient {
  const key = `${config.url}|${config.serviceKey}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: createClient(config.url, config.serviceKey, { auth: { persistSession: false } }),
    };
  }
  return cached.client;
}

export function resetObjectStorageForTests(): void {
  cached = null;
  bucketsReady.clear();
}

function required(): ObjectStorageConfig {
  const config = objectStorageConfig();
  if (!config) throw new Error('object_storage_not_configured');
  return config;
}

/** Create a private bucket once per process if it does not exist yet. */
async function ensureNamedBucket(
  config: ObjectStorageConfig,
  name: string,
  fileSizeLimit: number,
): Promise<void> {
  if (bucketsReady.has(name)) return;
  const { error } = await client(config).storage.createBucket(name, { public: false, fileSizeLimit });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`bucket_unavailable:${error.message}`);
  }
  bucketsReady.add(name);
}

export async function ensureBucket(config: ObjectStorageConfig = required()): Promise<void> {
  await ensureNamedBucket(config, config.bucket, 40 * 1024 * 1024);
}

export async function ensureRenderBucket(config: ObjectStorageConfig = required()): Promise<void> {
  await ensureNamedBucket(config, config.renderBucket, RENDER_FILE_LIMIT_BYTES);
}

export async function createSignedUpload(
  tributePublicId: string,
  assetId: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  const config = required();
  await ensureBucket(config);
  const path = objectKey(tributePublicId, assetId);
  const { data, error } = await client(config).storage.from(config.bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`signed_upload_failed:${error?.message ?? 'no_data'}`);
  return { signedUrl: data.signedUrl, token: data.token, path };
}

export async function downloadObject(
  tributePublicId: string,
  assetId: string,
): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  const config = required();
  const { data, error } = await client(config)
    .storage.from(config.bucket)
    .download(objectKey(tributePublicId, assetId));
  if (error || !data) return null;
  return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || null };
}

export async function uploadObject(
  tributePublicId: string,
  assetId: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const config = required();
  await ensureBucket(config);
  const { error } = await client(config)
    .storage.from(config.bucket)
    .upload(objectKey(tributePublicId, assetId), bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload_failed:${error.message}`);
}

export async function deleteObject(tributePublicId: string, assetId: string): Promise<void> {
  const config = required();
  await client(config).storage.from(config.bucket).remove([objectKey(tributePublicId, assetId)]);
}

export async function createSignedReadUrl(
  tributePublicId: string,
  assetId: string,
  seconds: number = SIGNED_READ_SECONDS,
): Promise<string | null> {
  const config = required();
  const { data, error } = await client(config)
    .storage.from(config.bucket)
    .createSignedUrl(objectKey(tributePublicId, assetId), seconds);
  return error || !data ? null : data.signedUrl;
}

async function removePrefix(bucketName: string, tributePublicId: string): Promise<number> {
  const bucket = client(required()).storage.from(bucketName);
  let removed = 0;
  for (let page = 0; page < 20; page += 1) {
    const { data, error } = await bucket.list(tributePublicId, { limit: 100 });
    if (error || !data || data.length === 0) break;
    const keys = data.map((item) => `${tributePublicId}/${item.name}`);
    const { error: removeError } = await bucket.remove(keys);
    if (removeError) break;
    removed += keys.length;
    if (data.length < 100) break;
  }
  return removed;
}

/** Remove every object of one tribute (uploads and finished films). Returns how many were removed. */
export async function removeTributeObjects(tributePublicId: string): Promise<number> {
  const config = required();
  return (
    (await removePrefix(config.bucket, tributePublicId)) +
    (await removePrefix(config.renderBucket, tributePublicId))
  );
}

/* ---- finished films and posters (bucket `renders`, written by the render worker) ---- */

export type RenderObjectKind = 'mp4' | 'poster' | 'pack';
const RENDER_SUFFIX: Record<RenderObjectKind, string> = { mp4: '.mp4', poster: '.poster.jpg', pack: '.pack.zip' };
const RENDER_CONTENT_TYPE: Record<RenderObjectKind, string> = {
  mp4: 'video/mp4',
  poster: 'image/jpeg',
  pack: 'application/zip',
};

export function renderObjectKey(tributePublicId: string, jobId: string, kind: RenderObjectKind): string {
  return `${tributePublicId}/${jobId}${RENDER_SUFFIX[kind]}`;
}

export async function renderObjectExists(tributePublicId: string, jobId: string, kind: RenderObjectKind): Promise<boolean> {
  const config = required();
  const name = `${jobId}${RENDER_SUFFIX[kind]}`;
  const { data, error } = await client(config)
    .storage.from(config.renderBucket)
    .list(tributePublicId, { search: name, limit: 5 });
  return !error && (data ?? []).some((entry) => entry.name === name);
}

export async function uploadRenderObject(
  tributePublicId: string,
  jobId: string,
  kind: RenderObjectKind,
  bytes: Buffer | Uint8Array,
): Promise<void> {
  const config = required();
  await ensureRenderBucket(config);
  const { error } = await client(config)
    .storage.from(config.renderBucket)
    .upload(renderObjectKey(tributePublicId, jobId, kind), bytes, {
      contentType: RENDER_CONTENT_TYPE[kind],
      upsert: true,
    });
  if (error) throw new Error(`render_upload_failed:${error.message}`);
}

export async function createRenderReadUrl(
  tributePublicId: string,
  jobId: string,
  kind: RenderObjectKind,
  options: { seconds?: number; downloadName?: string } = {},
): Promise<string | null> {
  const config = required();
  const { data, error } = await client(config)
    .storage.from(config.renderBucket)
    .createSignedUrl(
      renderObjectKey(tributePublicId, jobId, kind),
      options.seconds ?? SIGNED_READ_SECONDS,
      options.downloadName ? { download: options.downloadName } : undefined,
    );
  return error || !data ? null : data.signedUrl;
}

export async function downloadRenderObject(
  tributePublicId: string,
  jobId: string,
  kind: RenderObjectKind,
): Promise<Buffer | null> {
  const config = required();
  const { data, error } = await client(config)
    .storage.from(config.renderBucket)
    .download(renderObjectKey(tributePublicId, jobId, kind));
  return error || !data ? null : Buffer.from(await data.arrayBuffer());
}
