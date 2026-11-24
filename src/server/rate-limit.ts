type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function allowRequest(key: string, limit = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) {
    return false;
  }
  existing.count += 1;
  return true;
}

/** Short, non-reversible per-client key so limits apply per visitor instead of globally. */
export function clientKey(request: Request): string {
  const forwarded =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  let h = 5381;
  for (let i = 0; i < forwarded.length; i += 1) h = ((h * 33) ^ forwarded.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Non-reversible key for a subject such as an email address (so limits apply per account). */
export function subjectKey(subject: string): string {
  let h = 5381;
  const value = subject.trim().toLowerCase();
  for (let i = 0; i < value.length; i += 1) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
