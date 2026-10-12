import { stat } from 'node:fs/promises';

import { evaluateOutputQc } from '@memorialvideo/domain';

import { probeOutput } from '../src/qc';

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return flag?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const file = argValue('--file');
  const expected = Number(argValue('--duration') ?? '');
  if (!file || !Number.isFinite(expected)) {
    throw new Error('usage: complete-job --file=output.mp4 --duration=19.56');
  }
  const info = await stat(file);
  const probe = await probeOutput(file);
  const qc = evaluateOutputQc({
    expectedDurationSeconds: expected,
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
  process.stdout.write(`${JSON.stringify({ file, probe, qc }, null, 2)}\n`);
  if (!qc.ready) {
    process.exitCode = 1;
  }
}

await main();
