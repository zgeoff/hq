import { HqError } from '../errors.ts';
import type { Skipped } from './types.ts';

// --skipped "GEO-1=blocked by GEO-9;GEO-2=needs a design call": issue=reason pairs, semicolon apart.
export function parseSkipped(raw: string): Skipped[] {
  const MAX_SKIPPED = 100;
  const out: Skipped[] = [];
  for (const part of raw.split(';').map((x) => x.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    const issue = (eq < 0 ? part : part.slice(0, eq)).trim();
    const reason = eq < 0 ? '' : part.slice(eq + 1).trim();
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issue)) throw new HqError('bad_args', `--skipped takes ISSUE=reason pairs, such as "GEO-1=blocked by GEO-9"; "${part.slice(0, 60)}" has no issue like GEO-123`);
    if (reason.length < 1 || reason.length > 200) throw new HqError('bad_args', `--skipped reason for ${issue} must be 1 to 200 characters`);
    if (out.some((x) => x.issue === issue)) throw new HqError('bad_args', `--skipped names ${issue} twice`);
    out.push({ issue, reason });
    if (out.length > MAX_SKIPPED) throw new HqError('bad_args', `--skipped takes at most ${MAX_SKIPPED} issues`);
  }
  if (!out.length) throw new HqError('bad_args', '--skipped needs at least one ISSUE=reason');
  return out;
}
