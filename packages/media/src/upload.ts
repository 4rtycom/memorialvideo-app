import { z } from 'zod';

export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_VIDEO_MIMES = ['video/mp4'] as const;
export const ALLOWED_AUDIO_MIMES = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
] as const;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
export const MAX_VIDEO_DURATION_MS = 30_000;
export const MAX_AUDIO_DURATION_MS = 10 * 60_000;
export const MAX_ASSETS_PER_PROJECT = 120;
export const SOURCE_BUCKET = 'project-originals';
export const VARIANT_BUCKET = 'project-variants';

export const uploadDeclarationSchema = z.object({
  projectPublicId: z.string().min(8).max(40),
  assetType: z.enum(['image', 'video', 'audio']),
  declaredMime: z.string(),
  sizeBytes: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().optional(),
});

export type UploadDeclaration = z.infer<typeof uploadDeclarationSchema>;

export type UploadRejection =
  | 'unsupported_type'
  | 'too_large'
  | 'too_long'
  | 'empty'
  | 'quota';

export function opaqueOriginalKey(projectId: string, assetId: string): string {
  return `projects/${projectId}/assets/${assetId}/original`;
}

export function opaqueVariantKey(projectId: string, assetId: string, variant: string): string {
  return `projects/${projectId}/assets/${assetId}/variants/${variant}`;
}

export function assertNoPiiInStorageKey(key: string): boolean {
  return !key.includes('@') && !/\.(jpe?g|png|webp|mp4|wav|mp3)$/i.test(key.split('/').pop() ?? '');
}

export function classifyUpload(input: UploadDeclaration, existingAssetCount: number): UploadRejection | null {
  if (existingAssetCount >= MAX_ASSETS_PER_PROJECT) {
    return 'quota';
  }
  if (input.sizeBytes <= 0) {
    return 'empty';
  }
  if (input.assetType === 'image') {
    if (!(ALLOWED_IMAGE_MIMES as readonly string[]).includes(input.declaredMime)) {
      return 'unsupported_type';
    }
    if (input.sizeBytes > MAX_IMAGE_BYTES) {
      return 'too_large';
    }
  }
  if (input.assetType === 'video') {
    if (!(ALLOWED_VIDEO_MIMES as readonly string[]).includes(input.declaredMime)) {
      return 'unsupported_type';
    }
    if (input.sizeBytes > MAX_VIDEO_BYTES) {
      return 'too_large';
    }
    if ((input.durationMs ?? 0) > MAX_VIDEO_DURATION_MS) {
      return 'too_long';
    }
  }
  if (input.assetType === 'audio') {
    if (!(ALLOWED_AUDIO_MIMES as readonly string[]).includes(input.declaredMime)) {
      return 'unsupported_type';
    }
    if (input.sizeBytes > MAX_AUDIO_BYTES) {
      return 'too_large';
    }
    if ((input.durationMs ?? 0) > MAX_AUDIO_DURATION_MS) {
      return 'too_long';
    }
  }
  return null;
}
