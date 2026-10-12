export function mailpitHealthUrl(base = 'http://127.0.0.1:54324'): string {
  return `${base.replace(/\/$/, '')}/api/v1/info`;
}

export function canProbeMailpit(appEnv: string): boolean {
  return appEnv === 'local';
}
