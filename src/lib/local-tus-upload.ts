/** Mirror of server TUS_CHUNK_HINT — keep client free of node:fs imports. */
export const CLIENT_TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export type AuthorizeResponse = {
  assetId: string;
  mode: 'local_tus' | 'rejected_heic';
  uploadUrl?: string;
  chunkHintBytes?: number;
  byteSize?: number;
  blocker?: string;
};

export async function authorizeLocalUpload(input: {
  title: string;
  filename: string;
  contentType: string;
  byteSize: number;
  year?: string;
  musicRightsConfirmed?: boolean;
}): Promise<AuthorizeResponse> {
  const response = await fetch('/api/uploads/authorize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`authorize_${response.status}`);
  }
  return (await response.json()) as AuthorizeResponse;
}

export async function uploadFileLocalTus(input: {
  file: File;
  uploadUrl: string;
  chunkHintBytes?: number;
  onProgress?: (sent: number, total: number) => void;
}): Promise<void> {
  const chunkSize = input.chunkHintBytes ?? CLIENT_TUS_CHUNK_BYTES;
  let offset = 0;
  const head = await fetch(input.uploadUrl, { method: 'HEAD' });
  if (head.ok) {
    offset = Number(head.headers.get('Upload-Offset') ?? 0);
  }
  while (offset < input.file.size) {
    const end = Math.min(offset + chunkSize, input.file.size);
    const chunk = input.file.slice(offset, end);
    const patched = await fetch(input.uploadUrl, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
      },
      body: chunk,
    });
    if (!patched.ok) {
      throw new Error(`patch_${patched.status}`);
    }
    offset = Number(patched.headers.get('Upload-Offset') ?? end);
    input.onProgress?.(offset, input.file.size);
  }
}

export async function completeLocalUpload(input: {
  uploadId: string;
  assetId: string;
}): Promise<void> {
  const response = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`complete_${response.status}`);
  }
}

export function uploadIdFromUrl(uploadUrl: string): string {
  const parts = uploadUrl.split('/');
  return parts[parts.length - 1] ?? '';
}
