import { HqError } from '../errors.ts';
import { ISSUE } from './issue.ts';

export function parseFollowups(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  const xs = raw.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
  const bad = xs.find((x) => !ISSUE.test(x));
  if (bad) throw new HqError('bad_args', `--followups takes issue ids such as GEO-12,GEO-13; "${bad}" isn't one`);
  return [...new Set(xs)];
}
