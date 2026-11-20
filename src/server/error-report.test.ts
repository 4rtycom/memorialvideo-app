import { describe, expect, it, vi } from 'vitest';
import { buildErrorReport, safePath, sendErrorReport } from './error-report';

describe('error report', () => {
  it('drops query strings and keeps digest', () => {
    expect(safePath('/guest/upload?token=secret#x')).toBe('/guest/upload');
    const report = buildErrorReport(
      Object.assign(new Error('boom'), { digest: 'abc' }),
      { path: '/api/x?token=secret', method: 'POST' },
      { routePath: '/api/x', routeType: 'route' },
      new Date('2026-11-19T00:00:00Z'),
    );
    expect(report).toMatchObject({ message: 'boom', digest: 'abc', path: '/api/x', method: 'POST' });
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('only posts to https webhooks and never throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'));
    const report = buildErrorReport('x', { path: '/', method: 'GET' }, {});
    await sendErrorReport(report, 'http://insecure.example/hook');
    expect(fetchSpy).not.toHaveBeenCalled();
    await expect(sendErrorReport(report, 'https://hooks.example/x')).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
    log.mockRestore();
  });
});
