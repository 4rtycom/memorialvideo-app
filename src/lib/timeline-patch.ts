import { mapAutosaveHttpToUi, type AutosaveUiState } from '@memorialvideo/domain';

export type TimelinePatchResult =
  | {
      ok: true;
      timelineVersion: number;
      updatedAt: string;
      canUndo?: boolean;
      ui: AutosaveUiState;
    }
  | {
      ok: false;
      error: string;
      timelineVersion?: number;
      updatedAt?: string;
      ui: AutosaveUiState;
    };

export async function patchTimeline(
  body: Record<string, unknown>,
): Promise<TimelinePatchResult> {
  try {
    const response = await fetch('/api/tributes/active/timeline', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      timelineVersion?: number;
      updatedAt?: string;
      canUndo?: boolean;
    };
    const ui = mapAutosaveHttpToUi({ ok: response.ok, status: response.status });
    if (!response.ok) {
      return {
        ok: false,
        error: payload.error ?? `http_${response.status}`,
        timelineVersion: payload.timelineVersion,
        updatedAt: payload.updatedAt,
        ui,
      };
    }
    return {
      ok: true,
      timelineVersion: payload.timelineVersion ?? Number(body.expectedVersion) + 1,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      canUndo: payload.canUndo,
      ui,
    };
  } catch {
    return { ok: false, error: 'network', ui: 'offline' };
  }
}

export function autosaveLabel(ui: AutosaveUiState): string {
  switch (ui) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'conflict':
      return 'Newer version on server — reload to continue';
    case 'failed':
      return 'Could not save — previous timeline is safe';
    case 'offline':
      return 'Offline — changes not saved';
    default:
      return 'Local edits';
  }
}
