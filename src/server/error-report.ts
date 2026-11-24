export type ErrorReport = {
  at: string;
  message: string;
  digest?: string;
  path: string;
  method: string;
  routePath?: string;
  routeType?: string;
};

/** Strip query strings and hash: they can carry invite tokens or ids. */
export function safePath(path: string): string {
  return path.split(/[?#]/)[0] ?? '';
}

export function buildErrorReport(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
  now: Date = new Date(),
): ErrorReport {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  return {
    at: now.toISOString(),
    message,
    ...(digest ? { digest } : {}),
    path: safePath(request.path),
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  };
}

/** Optional HTTPS webhook (Slack-compatible `{ text }`). Never throws, never blocks long. */
export async function sendErrorReport(report: ErrorReport, webhookUrl: string | undefined): Promise<void> {
  console.error(JSON.stringify({ level: 'error', source: 'request', ...report }));
  if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: `MemorialVideo error on ${report.method} ${report.path}: ${report.message}${report.digest ? ` (digest ${report.digest})` : ''}`,
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* reporting must never break a request */
  }
}
