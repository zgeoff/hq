import { normalizePrRef } from '../runs/normalize-pr-ref.ts';

const PR_OWNER = /^(?:https?:\/\/github\.com\/|)(?<owner>[\w.-]+)\/[\w.-]+(?:#\d+|\/pull\/\d+)/u;

// A skip's `pr:` until, as typed (`pr:zgeoff/impz#654`, `pr:impz#654`, `pr:<github PR URL>`) or as
// stored (`pr:impz#654`): the PR's ref and its owner (null when the until names none), or null when
// the text is no PR until.
export function parsePRUntil(until: string): { ref: string; owner: string | null } | null {
  if (!until.startsWith('pr:')) {
    return null;
  }
  const rest = until.slice(3).trim();
  try {
    const normalized = normalizePrRef(rest);
    return { ref: normalized.ref, owner: PR_OWNER.exec(rest)?.groups?.['owner'] ?? null };
  } catch {
    return null;
  }
}
