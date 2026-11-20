/** Mirror of server TUS_CHUNK_HINT — keep client free of node:fs imports. */
export const CLIENT_TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export type AuthorizeResponse = {
  assetId: string;
  mode: 'local_tus' | 'supabase_signed';
  /** local_tus: where chunks are PATCHed. */
  uploadUrl?: string;
  /** supabase_signed: single-use signed Storage URL the browser PUTs the file to. */
  signedUrl?: string;
  apiKey?: string | null;
  chunkHintBytes?: number;
  byteSize?: number;
  blocker?: string;
};

export type CompleteUploadResponse = {
  ok: true;
  convertedFromHeic?: boolean;
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
}): Promise<CompleteUploadResponse> {
  const response = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`complete_${response.status}`);
  }
  return (await response.json()) as CompleteUploadResponse;
}

export function uploadIdFromUrl(uploadUrl: string): string {
  const parts = uploadUrl.split('/');
  return parts[parts.length - 1] ?? '';
}

/** PUT a file to a Supabase signed upload URL with progress (fetch has no upload progress events). */
export function uploadFileSigned(input: {
  file: File;
  signedUrl: string;
  apiKey?: string | null;
  onProgress?: (sent: number, total: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', input.signedUrl);
    if (input.apiKey) {
      xhr.setRequestHeader('apikey', input.apiKey);
      xhr.setRequestHeader('authorization', `Bearer ${input.apiKey}`);
    }
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress?.(input.file.size, input.file.size);
        resolve();
      } else {
        reject(new Error(`signed_put_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('signed_put_network'));
    const body = new FormData();
    body.append('cacheControl', '3600');
    body.append('', input.file);
    xhr.send(body);
  });
}

/** Upload by whichever mode authorize chose, then tell the server to verify and attach the bytes. */
export async function uploadAuthorizedFile(input: {
  auth: AuthorizeResponse;
  file: File;
  onProgress?: (sent: number, total: number) => void;
}): Promise<CompleteUploadResponse> {
  const { auth, file, onProgress } = input;
  if (auth.mode === 'supabase_signed') {
    if (!auth.signedUrl) throw new Error('no_upload_url');
    await uploadFileSigned({ file, signedUrl: auth.signedUrl, apiKey: auth.apiKey, onProgress });
    // Hosted uploads have no session id; the server finds the upload by asset id.
    return completeLocalUpload({ uploadId: auth.assetId, assetId: auth.assetId });
  }
  if (!auth.uploadUrl) throw new Error('no_upload_url');
  await uploadFileLocalTus({ file, uploadUrl: auth.uploadUrl, chunkHintBytes: auth.chunkHintBytes, onProgress });
  return completeLocalUpload({ uploadId: uploadIdFromUrl(auth.uploadUrl), assetId: auth.assetId });
}
