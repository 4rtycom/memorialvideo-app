import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

import { publishGeneratedAssetToBundle } from '../src/bundle-public';
import { posterExtractProps } from '../src/PosterExtract';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

export async function extractPosterFromLocalClip(input: string, output: string): Promise<void> {
  const absolute = path.resolve(input);
  await mkdir(path.dirname(output), { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src/index.ts'),
    onProgress: () => undefined,
  });
  const relativePublicPath = `extract/${path.basename(absolute)}`;
  await publishGeneratedAssetToBundle(serveUrl, absolute, relativePublicPath);
  const props = posterExtractProps(relativePublicPath);
  const composition = await selectComposition({
    serveUrl,
    id: 'PosterExtract',
    inputProps: props,
  });
  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps: props,
    frame: 0,
    imageFormat: 'jpeg',
    jpegQuality: 80,
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
      gl: 'angle',
    },
  });
}

async function main(): Promise<void> {
  const input = argValue('in');
  if (!input) {
    throw new Error('usage: poster:extract --in=<mp4>');
  }
  const output =
    argValue('out') ??
    path.resolve(root, '../../artifacts/posters', `${path.basename(path.resolve(input), path.extname(input))}.jpg`);
  await extractPosterFromLocalClip(input, output);
}

if (process.argv[1]?.includes('extract-poster')) {
  void main();
}
