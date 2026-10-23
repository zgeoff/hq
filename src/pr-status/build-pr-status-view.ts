import type { PRStatusRow } from '../kdb.ts';
import type { OwnerOverride } from './read-owner-overrides.ts';
import type { PRStatusView } from './types.ts';

// The record with its stale flags, against the PR's head now (null when it could not be read).
export function buildPRStatusView(row: PRStatusRow, current: string | null, override: OwnerOverride | null, reviewRecords: PRStatusView['reviewRecords']): PRStatusView {
  return {
    repo: row.repo,
    pr: row.pr,
    head: current ?? row.head,
    headKnown: current !== null,
    gate: row.gate,
    gateHead: row.gate_head,
    gateAt: row.gate_at,
    gateStale: isStale(row.gate_head, current),
    answer: row.answer,
    answerHead: row.answer_head,
    answerSource: row.answer_source,
    answerNote: row.answer_note,
    answerAt: row.answer_at,
    answerStale: isStale(row.answer_head, current),
    next: row.next,
    nextAt: row.next_at,
    override: override === null ? null : { head: override.head, source: override.source, note: override.note, at: override.at },
    reviewRecords,
    updatedAt: row.updated_at,
  };
}

function isStale(recorded: string | null, current: string | null): boolean {
  return recorded !== null && current !== null && recorded !== current;
}
