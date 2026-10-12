'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';

type InboxItem = {
  kind: string;
  id: string;
  subjectType: string;
  subjectId: string;
  labelKey: string;
  detail?: string;
};

type Overview = {
  inbox: InboxItem[];
  summary: {
    openCommentCount: number;
    openConflictCount: number;
    familyDisagreementCount: number;
    unreviewedDuplicateCount: number;
    openTaskCount: number;
    labelledSummaryKey: string;
    generativeUnavailable: true;
  };
  placementSuggestions: Array<{ id: string; assetId: string; status: string }>;
  placementPatchStates: Array<{
    suggestionId: string;
    status: string;
    applyStatus: 'none' | 'applied' | 'reverted';
  }>;
  activeFinalApproval: { outcome: string } | null;
  decisions: Array<{ id: string; kind: string; outcome: string }>;
  note: string;
  changeTimeline: false;
};

const LABEL: Record<string, string> = {
  'collab.inbox.placementSuggestion': 'Contributor placement waiting for your confirm',
  'collab.inbox.openComment': 'Open review note',
  'collab.inbox.openConflict': 'Open story conflict',
  'collab.inbox.familyDisagreement': 'Family disagreement',
  'collab.inbox.unreviewedDuplicate': 'Unreviewed duplicate',
  'collab.summary.openWork': 'Open family feedback to review.',
  'collab.summary.clear': 'No open collaboration items right now.',
  'collab.decision.approve': 'Approve',
  'collab.decision.request_changes': 'Request changes',
  'collab.decision.defer': 'Defer',
  'collab.decision.confirm': 'Confirm',
  'collab.decision.dismiss': 'Dismiss',
};

export function CollaborationInboxPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [placementState, setPlacementState] = useState<
    Record<string, 'idle' | 'previewed' | 'applied' | 'reverted' | 'failed'>
  >({});
  const [placementPreview, setPlacementPreview] = useState<
    Record<string, { beforeDurationFrames: number; afterDurationFrames: number }>
  >({});

  const load = useCallback(() => {
    setState('loading');
    void fetch('/api/collaboration/inbox')
      .then(async (response) => {
        if (!response.ok) {
          setState('failed');
          setError('Could not load collaboration inbox.');
          return;
        }
        const body = (await response.json()) as Overview;
        setOverview(body);
        setState('ready');
        setError(null);
      })
      .catch(() => {
        setState('failed');
        setError('Could not load collaboration inbox.');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function runPlacement(suggestionId: string, action: 'preview' | 'apply' | 'revert') {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/collaboration/placement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suggestionId, action }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        beforeDurationFrames?: number;
        afterDurationFrames?: number;
        overview?: Overview;
      };
      if (!response.ok) {
        setError(
          body.error === 'needs_timeline'
            ? 'Arrange a first film before confirming placement.'
            : body.error === 'already_in_timeline'
              ? 'That memory is already in the film.'
              : 'Placement action failed.',
        );
        setPlacementState((prev) => ({ ...prev, [suggestionId]: 'failed' }));
        return;
      }
      if (action === 'preview' && typeof body.beforeDurationFrames === 'number') {
        setPlacementPreview((prev) => ({
          ...prev,
          [suggestionId]: {
            beforeDurationFrames: body.beforeDurationFrames ?? 0,
            afterDurationFrames: body.afterDurationFrames ?? 0,
          },
        }));
        setPlacementState((prev) => ({ ...prev, [suggestionId]: 'previewed' }));
        setStatus('Placement preview ready — confirm to apply.');
      } else if (action === 'apply') {
        setPlacementState((prev) => ({ ...prev, [suggestionId]: 'applied' }));
        setStatus('Placement confirmed and applied to the timeline.');
        if (body.overview) {
          setOverview(body.overview);
        } else {
          load();
        }
      } else if (action === 'revert') {
        setPlacementState((prev) => ({ ...prev, [suggestionId]: 'reverted' }));
        setStatus('Placement reverted.');
        if (body.overview) {
          setOverview(body.overview);
        } else {
          load();
        }
      }
    });
  }

  function dismissPlacement(suggestionId: string) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/collaboration/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'placement',
          outcome: 'dismiss',
          subjectType: 'placement_suggestion',
          subjectId: suggestionId,
          summaryKey: 'collab.decision.dismiss',
        }),
      });
      if (!response.ok) {
        setError('Could not dismiss that placement.');
        return;
      }
      const body = (await response.json()) as { overview?: Overview };
      setStatus('Placement dismissed.');
      if (body.overview) {
        setOverview(body.overview);
      } else {
        load();
      }
    });
  }

  function recordFinal(outcome: 'approve' | 'request_changes' | 'defer') {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/collaboration/decisions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'approval',
          outcome,
          subjectType: 'final_film',
          subjectId: 'film',
          summaryKey: `collab.decision.${outcome}`,
        }),
      });
      if (!response.ok) {
        setError('Could not record that family decision.');
        return;
      }
      const body = (await response.json()) as { overview?: Overview };
      setStatus('Family decision saved.');
      if (body.overview) {
        setOverview(body.overview);
      } else {
        load();
      }
    });
  }

  return (
    <Card className="!p-6 mt-8" data-testid="collaboration-inbox">
      <h3 className="serif text-[28px] m-0 mb-2">Collaboration inbox</h3>
      <p className="text-[color:var(--muted)] mb-3">
        Contributor uploads propose film placement only. You preview, confirm, or dismiss — AI never
        decides.
      </p>
      <p className="text-[12px] text-[color:var(--accent)] mb-4">
        Deterministic summary only. Generative family feedback is not configured.
      </p>

      {state === 'loading' ? (
        <p className="text-[14px] text-[color:var(--muted)]">Loading collaboration…</p>
      ) : null}
      {state === 'failed' ? (
        <div className="mb-4">
          <p className="text-[13px] text-[color:var(--accent)]" role="alert">
            {error}
          </p>
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      ) : null}

      {overview ? (
        <>
          <p className="text-[14px] mb-3" data-testid="collaboration-summary">
            {LABEL[overview.summary.labelledSummaryKey] ?? overview.summary.labelledSummaryKey}
            {overview.summary.openTaskCount > 0
              ? ` · ${overview.summary.openTaskCount} open task(s)`
              : ''}
          </p>

          {overview.inbox.length === 0 ? (
            <p className="text-[14px] text-[color:var(--muted)] mb-4">
              Nothing waiting for a family decision.
            </p>
          ) : (
            <ul
              className="list-none p-0 m-0 mb-5 grid gap-4"
              data-testid="collaboration-inbox-list"
            >
              {overview.inbox.map((item) => (
                <li key={item.id} className="border-t border-[color:var(--line)] pt-3">
                  <p className="text-[14px] m-0 mb-2">
                    {LABEL[item.labelKey] ?? item.labelKey}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </p>
                  {item.kind === 'placement_suggestion' ? (
                    <div
                      className="flex flex-wrap gap-2 items-center"
                      data-testid={`collab-placement-${item.subjectId}`}
                    >
                      <Button
                        variant="secondary"
                        disabled={pending}
                        data-testid={`collab-placement-preview-${item.subjectId}`}
                        onClick={() => runPlacement(item.subjectId, 'preview')}
                      >
                        Preview
                      </Button>
                      <Button
                        disabled={
                          pending ||
                          (placementState[item.subjectId] !== 'previewed' &&
                            placementState[item.subjectId] !== 'applied' &&
                            placementState[item.subjectId] !== 'reverted')
                        }
                        data-testid={`collab-placement-apply-${item.subjectId}`}
                        onClick={() => runPlacement(item.subjectId, 'apply')}
                      >
                        Confirm & apply
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending || placementState[item.subjectId] !== 'applied'}
                        data-testid={`collab-placement-revert-${item.subjectId}`}
                        onClick={() => runPlacement(item.subjectId, 'revert')}
                      >
                        Revert
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        data-testid={`collab-placement-dismiss-${item.subjectId}`}
                        onClick={() => dismissPlacement(item.subjectId)}
                      >
                        Dismiss
                      </Button>
                      {placementPreview[item.subjectId] ? (
                        <span
                          className="text-[12px] text-[color:var(--muted)]"
                          data-testid={`collab-placement-preview-meta-${item.subjectId}`}
                        >
                          {placementPreview[item.subjectId]?.beforeDurationFrames}→
                          {placementPreview[item.subjectId]?.afterDurationFrames} frames
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {(overview.placementPatchStates ?? []).some((item) => item.applyStatus === 'applied') ? (
            <div className="mb-5" data-testid="collaboration-placement-applied">
              <h4 className="serif text-[20px] m-0 mb-2">Applied placements</h4>
              <ul className="list-none p-0 m-0 grid gap-2">
                {overview.placementPatchStates
                  .filter((item) => item.applyStatus === 'applied')
                  .map((item) => (
                    <li key={item.suggestionId} className="flex gap-2 items-center">
                      <span className="text-[13px] text-[color:var(--muted)]">
                        Confirmed in film
                      </span>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => runPlacement(item.suggestionId, 'revert')}
                      >
                        Revert
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <div className="mb-4">
            <h4 className="serif text-[20px] m-0 mb-2">Final film approval</h4>
            <p className="text-[13px] text-[color:var(--muted)] mb-3" data-testid="collaboration-approval-state">
              {overview.activeFinalApproval
                ? LABEL[`collab.decision.${overview.activeFinalApproval.outcome}`] ??
                  overview.activeFinalApproval.outcome
                : 'No family approval recorded yet.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['approve', 'request_changes', 'defer'] as const).map((outcome) => (
                <Button
                  key={outcome}
                  variant={outcome === 'approve' ? 'primary' : 'secondary'}
                  disabled={pending}
                  data-testid={`collab-final-${outcome}`}
                  onClick={() => recordFinal(outcome)}
                >
                  {LABEL[`collab.decision.${outcome}`]}
                </Button>
              ))}
            </div>
          </div>

          {overview.decisions.length > 0 ? (
            <ul
              className="list-none p-0 m-0 text-[13px] text-[color:var(--muted)] grid gap-1"
              data-testid="collaboration-history"
            >
              {overview.decisions.slice(0, 8).map((decision) => (
                <li key={decision.id}>
                  {LABEL[`collab.decision.${decision.outcome}`] ?? decision.outcome} ·{' '}
                  {decision.kind}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      {error && state === 'ready' ? (
        <p className="text-[13px] text-[color:var(--accent)] mt-3" role="alert">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-[13px] text-[color:var(--muted)] mt-3">{status}</p> : null}
    </Card>
  );
}
