export type StaleKind = { kind: 'done-open'; since: string; ref: string; mergedAt: string | null } | { kind: 'stalled'; since: string } | { kind: 'live' };

export function pickStaleKind(startedAt: string, prs: readonly { ref: string; status: string; mergedAt: string | null }[]): StaleKind {
  const known = prs.filter((pr) => ['open', 'draft', 'merged', 'closed'].includes(pr.status));
  if (known.some((pr) => pr.status === 'open' || pr.status === 'draft')) {
    return { kind: 'live' };
  }
  if (known.length > 0 && known.every((pr) => pr.status === 'merged')) {
    const last = known.reduce((latest, pr) => ((pr.mergedAt ?? startedAt) > (latest.mergedAt ?? startedAt) ? pr : latest));
    return { kind: 'done-open', since: last.mergedAt ?? startedAt, ref: last.ref, mergedAt: last.mergedAt };
  }
  return { kind: 'stalled', since: startedAt };
}
