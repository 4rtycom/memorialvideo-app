import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const PUBLIC_ID = /^mv_[a-f0-9]{16}$/i;
const SAFE_NAME = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Remove every file a tribute owns on local disk: uploaded media, enhancement outputs,
 * unfinished tus uploads and render outputs. Best effort per path; never throws.
 * Returns how many top-level paths were removed so callers can log it.
 */
export async function purgeTributeFiles(
  tribute: { publicId: string; renderJobIds: readonly string[] },
  root: string = path.join(process.cwd(), '.data'),
): Promise<number> {
  if (!PUBLIC_ID.test(tribute.publicId)) return 0;
  let removed = 0;
  const drop = async (target: string, recursive = false) => {
    try {
      await rm(target, { recursive, force: true });
      removed += 1;
    } catch {
      /* best effort */
    }
  };

  await drop(path.join(root, 'media', tribute.publicId), true);
  await drop(path.join(root, 'enhancements', tribute.publicId), true);

  const tusDir = path.join(root, 'tus');
  try {
    for (const name of await readdir(tusDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const session = JSON.parse(await readFile(path.join(tusDir, name), 'utf8')) as {
          tributePublicId?: string;
        };
        if (session.tributePublicId === tribute.publicId) {
          await drop(path.join(tusDir, name));
          await drop(path.join(tusDir, name.replace(/\.json$/, '.bin')));
        }
      } catch {
        /* unreadable session: leave it */
      }
    }
  } catch {
    /* no tus dir */
  }

  const rendersDir = path.join(root, 'renders');
  const jobIds = new Set(tribute.renderJobIds.filter((id) => SAFE_NAME.test(id)));
  if (jobIds.size > 0) {
    try {
      for (const name of await readdir(rendersDir)) {
        const id = name.split('.')[0] ?? '';
        if (jobIds.has(id)) await drop(path.join(rendersDir, name), true);
      }
    } catch {
      /* no renders dir */
    }
  }
  return removed;
}
