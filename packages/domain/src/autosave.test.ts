import { describe, expect, it } from 'vitest';

import { mapAutosaveHttpToUi, planAutosaveWrite } from './autosave';

describe('autosave conflict planning', () => {
  it('rejects missing client revision when required', () => {
    expect(
      planAutosaveWrite({
        clientUpdatedAt: undefined,
        serverUpdatedAt: '2026-10-11T10:00:00.000Z',
        requireClientRevision: true,
      }),
    ).toEqual({ action: 'reject', reason: 'missing_revision' });
  });

  it('saves when revisions match and allows omit when not required', () => {
    expect(
      planAutosaveWrite({
        clientUpdatedAt: '2026-10-11T10:00:00.000Z',
        serverUpdatedAt: '2026-10-11T10:00:00.000Z',
        requireClientRevision: true,
      }),
    ).toEqual({ action: 'save' });
    expect(
      planAutosaveWrite({
        clientUpdatedAt: undefined,
        serverUpdatedAt: '2026-10-11T10:00:00.000Z',
        requireClientRevision: false,
      }),
    ).toEqual({ action: 'save' });
  });

  it('maps HTTP outcomes to calm UI states', () => {
    expect(mapAutosaveHttpToUi({ ok: true, status: 200 })).toBe('saved');
    expect(mapAutosaveHttpToUi({ ok: false, status: 409 })).toBe('conflict');
    expect(mapAutosaveHttpToUi({ ok: false, status: 400 })).toBe('failed');
    expect(mapAutosaveHttpToUi({ ok: false, status: 0, networkError: true })).toBe('offline');
  });
});
