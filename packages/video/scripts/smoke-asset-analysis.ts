import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analysisIdempotencyKey } from '@memorialvideo/domain';
import { encodeJpeg, encodePng, inspectStoredMedia, sha256Hex } from '@memorialvideo/media';

const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(videoRoot, '../..');

async function loadRepoEnv(): Promise<void> {
  try {
    const text = await readFile(path.join(root, '.env.local'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq < 1) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function checker(width: number, height: number, tweak = 0) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      const offset = (y * width + x) * 4;
      data.set(on ? [220 - tweak, 200, 160, 255] : [40, 50, 60, 255], offset);
    }
  }
  return { width, height, data };
}

function solid(width: number, height: number, value: number) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set([value, value, value, 255], index * 4);
  }
  return { width, height, data };
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('service_unconfigured');
  }

  const rest = async (method: string, pathName: string, body?: unknown) => {
    const response = await fetch(`${supabaseUrl}/rest/v1${pathName}`, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (response.status >= 400) {
      throw new Error(`${method} ${pathName} ${response.status} ${text.slice(0, 240)}`);
    }
    return text ? JSON.parse(text) : null;
  };

  const upload = async (key: string, bytes: Uint8Array, mime: string) => {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/project-originals/${key}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: Buffer.from(bytes),
    });
    if (!response.ok) {
      throw new Error(`upload ${response.status}`);
    }
  };

  const outDir = path.join(root, 'artifacts', 'analysis-smoke');
  await mkdir(outDir, { recursive: true });
  const jpeg = encodeJpeg(checker(800, 600));
  const jpegDup = jpeg.slice();
  const similar = encodeJpeg(checker(800, 600, 6));
  const dark = encodePng(solid(800, 600, 4));
  const unsupported = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  await writeFile(path.join(outDir, 'primary.jpg'), jpeg);
  await writeFile(path.join(outDir, 'duplicate-other-name.jpg'), jpegDup);
  await writeFile(path.join(outDir, 'similar.jpg'), similar);
  await writeFile(path.join(outDir, 'dark.png'), dark);

  const local = await inspectStoredMedia(jpeg);
  const similarInspect = await inspectStoredMedia(similar);
  const darkInspect = await inspectStoredMedia(dark);
  const unsupportedInspect = await inspectStoredMedia(unsupported);
  if (local.media.mediaKind !== 'photo' || local.media.width !== 800) {
    throw new Error('local_jpeg_metadata');
  }
  if (sha256Hex(jpeg) !== sha256Hex(jpegDup)) {
    throw new Error('exact_checksum');
  }
  if (local.checksum === similarInspect.checksum) {
    throw new Error('similar_must_differ');
  }

  const owner = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: `analysis.smoke.${Date.now()}@example.test`,
      password: 'local-test-pass-12',
      email_confirm: true,
    }),
  });
  if (!owner.ok) {
    throw new Error('user_create_failed');
  }
  const user = (await owner.json()) as { id: string };
  const project = (
    await rest('POST', '/projects', {
      public_id: `mv_smoke_${Date.now()}`,
      display_name: 'Analysis smoke',
      owner_user_id: user.id,
    })
  )[0] as { id: string; public_id: string };

  const seedAsset = async (label: string, bytes: Uint8Array, mime: string) => {
    const assetId = crypto.randomUUID();
    const storageKey = `projects/${project.id}/assets/${assetId}/original`;
    await upload(storageKey, bytes, mime);
    await rest('POST', '/assets', {
      id: assetId,
      project_id: project.id,
      uploaded_by_user_id: user.id,
      asset_type: 'image',
      status: 'READY',
      storage_bucket: 'project-originals',
      storage_key: storageKey,
      declared_mime: mime,
      size_bytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
    });
    const analysis = (
      await rest('POST', '/asset_analyses', {
        project_id: project.id,
        asset_id: assetId,
        schema_version: 1,
        analyser_version: 'v1',
        source_checksum: sha256Hex(bytes),
        status: 'queued',
        media_kind: 'photo',
        report: {},
      })
    )[0] as { id: string };
    await rest('POST', '/asset_analysis_jobs', {
      project_id: project.id,
      asset_id: assetId,
      analysis_id: analysis.id,
      status: 'QUEUED',
      idempotency_key: analysisIdempotencyKey(assetId, sha256Hex(bytes)),
    });
    return { label, assetId, analysisId: analysis.id };
  };

  const first = await seedAsset('primary', jpeg, 'image/jpeg');
  const exact = await seedAsset('exact', jpegDup, 'image/jpeg');
  const near = await seedAsset('similar', similar, 'image/jpeg');
  const low = await seedAsset('dark', dark, 'image/png');
  const bad = await seedAsset('unsupported', unsupported, 'application/octet-stream');
  const missingId = crypto.randomUUID();
  await rest('POST', '/assets', {
    id: missingId,
    project_id: project.id,
    uploaded_by_user_id: user.id,
    asset_type: 'image',
    status: 'READY',
    storage_bucket: 'project-originals',
    storage_key: `projects/${project.id}/assets/${missingId}/missing`,
    declared_mime: 'image/jpeg',
    size_bytes: 12,
  });
  const missingAnalysis = (
    await rest('POST', '/asset_analyses', {
      project_id: project.id,
      asset_id: missingId,
      schema_version: 1,
      analyser_version: 'v1',
      source_checksum: 'f'.repeat(64),
      status: 'queued',
      media_kind: 'photo',
      report: {},
    })
  )[0] as { id: string };
  await rest('POST', '/asset_analysis_jobs', {
    project_id: project.id,
    asset_id: missingId,
    analysis_id: missingAnalysis.id,
    status: 'QUEUED',
    idempotency_key: analysisIdempotencyKey(missingId, 'f'.repeat(64)),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        projectPublicId: project.public_id,
        assets: { first, exact, near, low, bad, missingId },
        local: {
          width: local.media.mediaKind === 'photo' ? local.media.width : null,
          similarDiffers: local.checksum !== similarInspect.checksum,
          darkSuggestion: darkInspect.quality.some((item) => item.code === 'dark_exposure'),
          unsupportedPartial: unsupportedInspect.partial,
        },
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1]?.includes('smoke-asset-analysis')) {
  void main();
}
