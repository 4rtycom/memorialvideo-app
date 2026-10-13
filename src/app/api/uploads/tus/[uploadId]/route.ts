import { NextResponse } from 'next/server';
import { appendUploadChunk, readUploadSession } from '@/server/media-storage';
import { callerCanAccessTribute } from '@/server/upload-access';

export const runtime = 'nodejs';

type Params = { params: Promise<{ uploadId: string }> };

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Tus-Resumable': '1.0.0',
      'Tus-Version': '1.0.0',
      'Tus-Extension': 'creation',
      'Tus-Max-Size': String(40 * 1024 * 1024),
    },
  });
}

export async function HEAD(_request: Request, { params }: Params) {
  const { uploadId } = await params;
  const session = await readUploadSession(uploadId);
  if (!session || !(await callerCanAccessTribute(session.tributePublicId))) {
    return new NextResponse(null, { status: 404, headers: { 'Tus-Resumable': '1.0.0' } });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': String(session.offset),
      'Upload-Length': String(session.byteSize),
      'Cache-Control': 'no-store',
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { uploadId } = await params;
  const tus = request.headers.get('Tus-Resumable');
  if (tus !== '1.0.0') {
    return NextResponse.json({ error: 'tus_version' }, { status: 400 });
  }
  const offsetHeader = request.headers.get('Upload-Offset');
  const offset = offsetHeader ? Number(offsetHeader) : NaN;
  if (!Number.isFinite(offset)) {
    return NextResponse.json({ error: 'offset_required' }, { status: 400 });
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  const session = await readUploadSession(uploadId);
  if (!session || !(await callerCanAccessTribute(session.tributePublicId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Tus-Resumable': '1.0.0' } });
  }
  const result = await appendUploadChunk(uploadId, offset, buffer);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      {
        status: result.status,
        headers: { 'Tus-Resumable': '1.0.0' },
      },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': String(result.session.offset),
    },
  });
}
