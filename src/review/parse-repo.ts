import { HqError } from '../errors.ts';

// "widgets" or "zgeoff/widgets".
export function parseRepo(raw: string, defaultOwner: string): { owner: string; repo: string } {
  const m = /^(?:([A-Za-z0-9-]+)\/)?([A-Za-z0-9._-]+)$/.exec(raw);
  if (!m || m[2] === '.' || m[2] === '..') throw new HqError('bad_args', `repo "${raw}" must be a repo name or owner/repo`);
  return { owner: m[1] ?? defaultOwner, repo: m[2]! };
}
