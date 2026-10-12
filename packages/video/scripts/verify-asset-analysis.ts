import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

async function main(): Promise<void> {
  await loadRepoEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('service_unconfigured');
  }
  const publicId = process.argv.find((arg) => arg.startsWith('--publicId='))?.slice(11);
  if (!publicId) {
    throw new Error('missing_public_id');
  }
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const projectRes = await fetch(`${supabaseUrl}/rest/v1/projects?public_id=eq.${publicId}&select=id`, { headers });
  const project = ((await projectRes.json()) as Array<{ id: string }>)[0];
  if (!project) {
    throw new Error('project_missing');
  }
  const analyses = (await (
    await fetch(
      `${supabaseUrl}/rest/v1/asset_analyses?project_id=eq.${project.id}&select=status,media_kind,error_code,correction_state,report`,
      { headers },
    )
  ).json()) as Array<{
    status: string;
    media_kind: string;
    error_code: string | null;
    correction_state: string;
    report: {
      duplicates?: Array<{ kind: string; reviewState: string }>;
      quality?: Array<{ code: string }>;
      media?: { width?: number };
    };
  }>;
  const links = (await (
    await fetch(`${supabaseUrl}/rest/v1/asset_duplicate_links?project_id=eq.${project.id}&select=kind,method,review_state`, {
      headers,
    })
  ).json()) as Array<{ kind: string; method: string; review_state: string }>;
  const assets = (await (
    await fetch(`${supabaseUrl}/rest/v1/assets?project_id=eq.${project.id}&select=status`, { headers })
  ).json()) as Array<{ status: string }>;
  process.stdout.write(
    `${JSON.stringify(
      {
        analyses: analyses.map((row) => ({
          status: row.status,
          mediaKind: row.media_kind,
          errorCode: row.error_code,
          correctionState: row.correction_state,
          width: row.report?.media?.width,
          qualityCodes: row.report?.quality?.map((item) => item.code) ?? [],
          duplicateKinds: row.report?.duplicates?.map((item) => `${item.kind}:${item.reviewState}`) ?? [],
        })),
        links,
        assetStatuses: assets.map((row) => row.status),
      },
      null,
      2,
    )}\n`,
  );
}

void main();
