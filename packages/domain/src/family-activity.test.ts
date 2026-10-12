import { describe, expect, it } from 'vitest';

import {
  buildFamilyActivityFeed,
  mapAuditActionToFamilyActivity,
  summarizeContributionHistory,
} from './family-activity';
import {
  canChangeMemberRole,
  canInviteMemberRole,
  canRevokeMember,
  memberInviteIsUsable,
  memberMayEditFilm,
} from './members';
import { mapAutosaveHttpToUi, planAutosaveWrite } from './autosave';
import { notificationIdempotencyKey, resolveEmailProvider } from './email-provider';
import { emailTemplateCoverage, EMAIL_TEMPLATES } from './email';

describe('family activity + members', () => {
  it('maps audit keys to calm family activity without exposing other noise', () => {
    expect(mapAuditActionToFamilyActivity('asset.upload_completed')).toBe('memory_added');
    expect(mapAuditActionToFamilyActivity('render.job_queued')).toBe('render_queued');
    expect(mapAuditActionToFamilyActivity('director.provider_failed')).toBe('other');
    const feed = buildFamilyActivityFeed([
      { id: '1', actionKey: 'asset.upload_completed', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', actionKey: 'director.provider_failed', createdAt: '2026-01-01T00:01:00.000Z' },
      { id: '3', actionKey: 'invite.created', createdAt: '2026-01-01T00:02:00.000Z' },
    ]);
    expect(feed).toHaveLength(2);
    expect(feed[0]?.labelKey).toBe('activity.memory_added');
  });

  it('summarizes contribution history without filenames', () => {
    const items = summarizeContributionHistory([
      {
        id: 'a1',
        contributorId: 'c1',
        status: 'READY',
        createdAt: '2026-01-02T00:00:00.000Z',
        deletedAt: null,
      },
      {
        id: 'a2',
        contributorId: null,
        status: 'READY',
        createdAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      },
    ]);
    expect(items[0]?.source).toBe('contributor');
    expect(items[1]?.source).toBe('owner');
  });

  it('gates member invite/role/revoke to owners', () => {
    expect(canInviteMemberRole('owner', 'editor')).toBe(true);
    expect(canInviteMemberRole('editor', 'viewer')).toBe(false);
    expect(canChangeMemberRole({ actorRole: 'owner', targetRole: 'editor', nextRole: 'viewer' })).toBe(true);
    expect(canChangeMemberRole({ actorRole: 'owner', targetRole: 'owner', nextRole: 'editor' })).toBe(false);
    expect(canRevokeMember({ actorRole: 'owner', targetRole: 'viewer' })).toBe(true);
    expect(memberMayEditFilm('viewer')).toBe(false);
    expect(
      memberInviteIsUsable({
        revokedAt: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
        acceptedAt: null,
      }),
    ).toBe(true);
  });
});

describe('autosave + email provider', () => {
  it('refuses stale autosaves and maps conflict/offline UI', () => {
    expect(
      planAutosaveWrite({
        clientUpdatedAt: '2026-01-01T00:00:00.000Z',
        serverUpdatedAt: '2026-01-01T00:00:01.000Z',
        requireClientRevision: true,
      }),
    ).toEqual({ action: 'conflict', reason: 'stale_revision' });
    expect(mapAutosaveHttpToUi({ ok: false, status: 409 })).toBe('conflict');
    expect(mapAutosaveHttpToUi({ ok: false, status: 0, networkError: true })).toBe('offline');
  });

  it('covers new transactional templates and stable notification keys', () => {
    expect(emailTemplateCoverage()).toEqual([...EMAIL_TEMPLATES]);
    expect(resolveEmailProvider('mailpit')).toBe('mailpit');
    expect(resolveEmailProvider('blocked_production')).toBe('noop');
    expect(
      notificationIdempotencyKey({
        template: 'contribution_received',
        projectId: 'proj',
        subjectKey: 'asset:abc',
      }),
    ).toBe('notify:contribution_received:proj:asset:abc');
  });
});
