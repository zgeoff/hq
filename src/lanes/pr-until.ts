import { normalizePrRef } from '../runs/normalize-pr-ref.ts';

const SHORT_OWNER = /^(?<owner>[\w.-]+)\//u;

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
    const owner = normalized.url === null ? (SHORT_OWNER.exec(rest)?.groups?.['owner'] ?? null) : (new URL(normalized.url).pathname.split('/')[1] ?? null);
    return { ref: normalized.ref, owner };
  } catch {
    return null;
  }
}
