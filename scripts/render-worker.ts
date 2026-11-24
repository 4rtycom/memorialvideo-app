/**
 * Render worker: run exactly ONE instance next to the app (see worker/README.md).
 * Polls the store for queued film jobs, renders them with ffmpeg, uploads the result to Supabase
 * Storage and marks the job READY only after Output QC passed.
 */
import { productionDeps, runWorkerCycle } from '../src/server/render-worker';

const POLL_MS = Number(process.env.RENDER_WORKER_POLL_MS ?? 5000);
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[render-worker] ${signal} received, finishing the current job`);
    stopping = true;
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const deps = await productionDeps();
  console.log('[render-worker] started');
  while (!stopping) {
    try {
      const outcome = await runWorkerCycle(deps);
      if (outcome === 'idle') await sleep(POLL_MS);
    } catch (error) {
      console.error('[render-worker] cycle failed', error);
      await sleep(POLL_MS * 2);
    }
  }
  console.log('[render-worker] stopped');
}

void main();
