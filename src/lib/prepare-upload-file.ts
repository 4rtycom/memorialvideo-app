/** True when the chosen file is an iPhone HEIC/HEIF still. */
export function isHeicFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

/**
 * Prefer browser conversion when the runtime can decode HEIC (Safari/iOS).
 * Falls back to the original file so the server can convert after upload.
 */
export async function prepareUploadFile(file: File): Promise<{
  file: File;
  convertedFromHeic: boolean;
}> {
  if (!isHeicFile(file)) {
    return { file, convertedFromHeic: false };
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return { file, convertedFromHeic: false };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || bitmap.width < 1 || bitmap.height < 1) {
      bitmap.close();
      return { file, convertedFromHeic: false };
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((next) => resolve(next), 'image/jpeg', 0.92);
    });
    if (!blob || blob.size < 32) {
      return { file, convertedFromHeic: false };
    }
    const jpegName = file.name.replace(/\.(heic|heif)$/i, '.jpg') || 'photo.jpg';
    return {
      file: new File([blob], jpegName.endsWith('.jpg') ? jpegName : `${jpegName}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }),
      convertedFromHeic: true,
    };
  } catch {
    return { file, convertedFromHeic: false };
  }
}
