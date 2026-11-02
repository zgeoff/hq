// What an In Progress issue with no open run and no active session is stuck on. since is when it began
// to wait: the last merge for done-open, the start for stalled.
export type StaleKind = { kind: 'done-open'; since: string; ref: string } | { kind: 'stalled'; since: string } | { kind: 'live' };

// Done-open: it has PRs and every one merged, so the work is in and only the close is missing. Live: a
// PR is still open or draft. Stalled: no PRs, or only closed ones beside any merged. A PR whose status
// hq does not know is left out of the decision.
export function pickStaleKind(startedAt: string, prs: readonly { ref: string; status: string; mergedAt: string | null }[]): StaleKind {
  const known = prs.filter((pr) => ['open', 'draft', 'merged', 'closed'].includes(pr.status));
  if (known.some((pr) => pr.status === 'open' || pr.status === 'draft')) {
    return { kind: 'live' };
  }
  if (known.length > 0 && known.every((pr) => pr.status === 'merged')) {
    const last = known.reduce((latest, pr) => ((pr.mergedAt ?? startedAt) > (latest.mergedAt ?? startedAt) ? pr : latest));
    return { kind: 'done-open', since: last.mergedAt ?? startedAt, ref: last.ref };
  }
  return { kind: 'stalled', since: startedAt };
}
