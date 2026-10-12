import type { ShareScope } from './invites';

export type MemberRole = 'owner' | 'editor' | 'viewer';
export type InvitableMemberRole = 'editor' | 'viewer';

export type ProjectMemberSummary = {
  userId: string;
  role: MemberRole;
  accepted: boolean;
  invitedBy: string | null;
};

export function canInviteMemberRole(actorRole: MemberRole, targetRole: InvitableMemberRole): boolean {
  return actorRole === 'owner' && (targetRole === 'editor' || targetRole === 'viewer');
}

export function canChangeMemberRole(input: {
  actorRole: MemberRole;
  targetRole: MemberRole;
  nextRole: InvitableMemberRole;
}): boolean {
  if (input.actorRole !== 'owner') {
    return false;
  }
  if (input.targetRole === 'owner') {
    return false;
  }
  return input.nextRole === 'editor' || input.nextRole === 'viewer';
}

export function canRevokeMember(input: { actorRole: MemberRole; targetRole: MemberRole }): boolean {
  return input.actorRole === 'owner' && input.targetRole !== 'owner';
}

export function memberInviteIsUsable(input: {
  revokedAt: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  now?: Date;
}): boolean {
  if (input.revokedAt || input.acceptedAt) {
    return false;
  }
  return Date.parse(input.expiresAt) > (input.now ?? new Date()).getTime();
}

export function defaultMemberInviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
}

/** Viewer membership is private film viewing only — not upload/edit. */
export function memberMayEditFilm(role: MemberRole): boolean {
  return role === 'owner' || role === 'editor';
}

export function memberMayUpload(role: MemberRole): boolean {
  return role === 'owner' || role === 'editor';
}

export function viewingShareScopeForMember(role: MemberRole): ShareScope | null {
  if (role === 'viewer') {
    return 'final_view';
  }
  return null;
}
