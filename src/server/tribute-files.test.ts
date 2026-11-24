import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { purgeTributeFiles } from './tribute-files';

const A = 'mv_aaaaaaaaaaaaaaaa';
const B = 'mv_bbbbbbbbbbbbbbbb';
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('purgeTributeFiles', () => {
  it('removes only the given tribute’s media, tus uploads and renders', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'purge-'));
    for (const id of [A, B]) {
      await mkdir(path.join(root, 'media', id), { recursive: true });
      await writeFile(path.join(root, 'media', id, 'mem_1'), 'x');
      await mkdir(path.join(root, 'enhancements', id), { recursive: true });
    }
    await mkdir(path.join(root, 'tus'));
    await writeFile(path.join(root, 'tus', 'u1.json'), JSON.stringify({ tributePublicId: A }));
    await writeFile(path.join(root, 'tus', 'u1.bin'), 'x');
    await writeFile(path.join(root, 'tus', 'u2.json'), JSON.stringify({ tributePublicId: B }));
    await mkdir(path.join(root, 'renders'));
    await writeFile(path.join(root, 'renders', 'rjob_a1.mp4'), 'x');
    await writeFile(path.join(root, 'renders', 'rjob_a1.poster.jpg'), 'x');
    await writeFile(path.join(root, 'renders', 'rjob_b1.mp4'), 'x');

    await purgeTributeFiles({ publicId: A, renderJobIds: ['rjob_a1'] }, root);

    expect(await readdir(path.join(root, 'media'))).toEqual([B]);
    expect(await readdir(path.join(root, 'enhancements'))).toEqual([B]);
    expect((await readdir(path.join(root, 'tus'))).sort()).toEqual(['u2.json']);
    expect(await readdir(path.join(root, 'renders'))).toEqual(['rjob_b1.mp4']);
  });

  it('ignores malformed ids and missing folders', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'purge-'));
    expect(await purgeTributeFiles({ publicId: '../etc', renderJobIds: ['../x'] }, root)).toBe(0);
    await expect(purgeTributeFiles({ publicId: A, renderJobIds: [] }, root)).resolves.toBeTypeOf('number');
  });
});
