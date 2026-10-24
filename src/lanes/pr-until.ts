import { normalizePrRef } from '../runs/normalize-pr-ref.ts';

const SHORT_OWNER = /^(?<owner>[\w.-]+)\//u;

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
