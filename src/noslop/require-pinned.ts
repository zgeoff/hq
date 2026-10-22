import { HqError } from '../errors.ts';

export function requirePinned(sha: string | null): string {
  if (sha === null) {
    throw new HqError('bad_config', 'no noslop commit is pinned: hq noslop pin <sha>');
  }
  return sha;
}
