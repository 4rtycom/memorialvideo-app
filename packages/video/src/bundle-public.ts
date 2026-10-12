import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Remotion `bundle()` snapshots `public/` into a temp folder.
 * Assets created after that snapshot (for example the PhoneClip MP4)
 * must be copied into the served bundle or `staticFile()` 404s.
 */
export function remotionBundledPublicPath(serveUrl: string, relativePublicPath: string): string {
  return path.join(serveUrl, 'public', relativePublicPath);
}

export async function publishGeneratedAssetToBundle(
  serveUrl: string,
  sourceAbsolutePath: string,
  relativePublicPath: string,
): Promise<string> {
  const destination = remotionBundledPublicPath(serveUrl, relativePublicPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(sourceAbsolutePath, destination);
  return destination;
}
