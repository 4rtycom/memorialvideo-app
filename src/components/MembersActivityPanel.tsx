'use client';

import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

type Member = {
  id: string;
  label: string;
  role: string;
  status: string;
  createdAt: string;
};

type Activity = {
  id: string;
  code: string;
  correlationId?: string;
  createdAt: string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  tribute_created: 'Tribute created',
  memory_added: 'Memory added',
  invite_created: 'Invitation created',
  invite_revoked: 'Invitation revoked',
  timeline_edited: 'Timeline edited',
  render_enqueued: 'Render enqueued',
  render_failed: 'Render failed QC',
  render_ready: 'Render READY after QC',
  share_created: 'Private share created',
  member_added: 'Member invited',
  checklist_updated: 'Ceremony checklist updated',
  pack_fulfilled: 'Memorial Pack unlocked',
  placement_proposed: 'Contributor placement proposed',
  placement_confirmed: 'Placement confirmed or reverted',
  collaboration_decision: 'Family collaboration decision',
};

export function MembersActivityPanel({
  initialMembers,
  initialActivity,
}: {
  initialMembers: Member[];
  initialActivity: Activity[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [activity, setActivity] = useState(initialActivity);
  const [label, setLabel] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return fetch('/api/members')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { members: Member[]; activity: Activity[] } | null) => {
        if (!data) return;
        setMembers(data.members);
        setActivity(data.activity);
      });
  }

  function inviteMember() {
    if (!label.trim()) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), role: 'viewer' }),
      });
      if (!response.ok) {
        setError('Could not add that member.');
        return;
      }
      setLabel('');
      await refresh();
    });
  }

  function revoke(memberId: string) {
    startTransition(async () => {
      const response = await fetch('/api/members', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ memberId, action: 'revoke' }),
      });
      if (!response.ok) {
        setError('Could not revoke that member.');
        return;
      }
      await refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2 mt-8">
      <Card className="!p-6">
        <h3 className="serif text-[28px] m-0 mb-3">Family members</h3>
        <p className="text-[color:var(--muted)] mb-4">
          Persist roles locally. Email invites need Supabase/Mailpit (not configured here).
        </p>
        <div className="flex gap-2 mb-4">
          <input
            className="field flex-1 !min-h-[48px]"
            placeholder="Display name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
          />
          <Button disabled={pending || !label.trim()} onClick={inviteMember}>
            Invite
          </Button>
        </div>
        {error ? (
          <p className="text-[13px] text-[color:var(--accent)] mb-3" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="list-none p-0 m-0 grid gap-2 text-[14px]">
          {members.map((member) => (
            <li key={member.id} className="flex justify-between gap-3 items-center">
              <span>
                {member.label} · {member.role} · {member.status}
              </span>
              {member.role !== 'owner' && member.status !== 'revoked' ? (
                <Button variant="ghost" disabled={pending} onClick={() => revoke(member.id)}>
                  Revoke
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card soft className="!p-6">
        <h3 className="serif text-[28px] m-0 mb-3">Activity</h3>
        <p className="text-[color:var(--muted)] mb-4">
          Metadata-only history — no emails, tokens, filenames, or captions.
        </p>
        <ul className="list-none p-0 m-0 grid gap-2 text-[13px] text-[color:var(--muted)]">
          {activity.length === 0 ? (
            <li>No activity yet.</li>
          ) : (
            activity.map((event) => (
              <li key={event.id}>
                {ACTIVITY_LABELS[event.code] ?? event.code}
                <span> · {event.createdAt.slice(0, 16).replace('T', ' ')}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
