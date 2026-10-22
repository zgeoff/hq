import { parseRepo } from '../review/parse-repo.ts';

export interface ParsedRepo {
  owner: string;
  repo: string;
}

const NOSLOP_OWNER = 'zgeoff';

// The parsed repo in lowercase: noslop rounds, the list and the review files all key on it.
export function parseLowerRepo(rawRepo: string, owner: string | undefined): ParsedRepo {
  const parsed = parseRepo(rawRepo, owner ?? NOSLOP_OWNER);
  return { owner: parsed.owner.toLowerCase(), repo: parsed.repo.toLowerCase() };
}
