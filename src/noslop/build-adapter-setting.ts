import { HqError } from '../errors.ts';
import { parseReviewAdapter } from './parse-review-adapter.ts';
import type { AdapterSetting } from './read-adapter-setting.ts';

const MAX_DAYS = 14;
const DAY_MS = 86_400_000;

export function buildAdapterSetting(rest: readonly string[], until: string | undefined, by: string, now: Date): AdapterSetting {
  const adapter = parseReviewAdapter(rest[0] ?? '');
  if (rest.length !== 1) {
    throw new HqError('bad_args', 'hq noslop adapter claude --until ISO, or hq noslop adapter codex');
  }
  if (adapter === 'codex') {
    if (until !== undefined) {
      throw new HqError('bad_args', 'codex is noslop\'s default adapter: give no --until');
    }
    return null;
  }
  const end = until === undefined ? Number.NaN : Date.parse(until);
  if (Number.isNaN(end) || end <= now.getTime() || end - now.getTime() > MAX_DAYS * DAY_MS) {
    throw new HqError('bad_args', `--until must be a time in the next ${MAX_DAYS} days, such as 2026-11-11T13:00:00Z`);
  }
  return { adapter: 'claude', until: new Date(end).toISOString(), by };
}
