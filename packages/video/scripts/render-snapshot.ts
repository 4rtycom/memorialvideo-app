import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { totalDurationFrames } from '@memorialvideo/contracts';
import { evaluateOutputQc } from '@memorialvideo/domain';

import { probeOutput } from '../src/qc';
import { renderTimelineToFile } from '../src/render-timeline';
import { parseSnapshotFile } from '../src/snapshot-render';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.resolve(root, '../../artifacts/renders');

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return flag?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const specPath = argValue('--spec');
  if (!specPath) {
    throw new Error('usage: render-snapshot --spec=path/to/spec.json');
  }
  const spec = parseSnapshotFile(await readFile(specPath, 'utf8'));
  const output = path.resolve(argValue('--out') ?? path.join(artifacts, `snapshot-${spec.kind}.mp4`));
  await renderTimelineToFile({
    entryPoint: path.join(root, 'src/index.ts'),
    timeline: spec.timeline,
    kind: spec.kind,
    output,
  });

  const probe = await probeOutput(output);
  const info = await stat(output);
  const qc = evaluateOutputQc({
    expectedDurationSeconds: totalDurationFrames(spec.timeline) / spec.timeline.fps,
    requireAudio: true,
    probe: {
      exists: info.isFile(),
      sizeBytes: info.size,
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationInSeconds,
      hasVideo: Boolean(probe.width),
      hasAudio: probe.hasAudio,
      container: probe.container,
    },
  });
  process.stdout.write(`${JSON.stringify({ output, snapshotKind: spec.kind, probe, qc }, null, 2)}\n`);
  if (!qc.ready) {
    process.exitCode = 1;
  }
}

await main();
