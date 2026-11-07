import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { AdapterSetting } from './read-adapter-setting.ts';

const MAX_DAYS = 14;
const DAY_MS = 86_400_000;
const USAGE = 'hq noslop adapter claude --until ISO, or hq noslop adapter codex';
const AdapterWordSchema = z.enum(['codex', 'claude']);

export function buildAdapterSetting(rest: readonly string[], until: string | undefined, by: string, now: Date): AdapterSetting {
  const word = AdapterWordSchema.safeParse(rest[0]);
  if (rest.length !== 1 || !word.success) {
    throw new HqError('bad_args', USAGE);
  }
  if (word.data === 'codex') {
    if (until !== undefined) {
      throw new HqError('bad_args', 'codex is noslop\'s default adapter: give no --until');
    }
    return null;
  }
  const end = parseZonedTime(until);
  if (Number.isNaN(end) || end <= now.getTime() || end - now.getTime() > MAX_DAYS * DAY_MS) {
    throw new HqError('bad_args', `--until must be a time with a zone in the next ${MAX_DAYS} days, such as 2026-11-11T13:00:00Z`);
  }
  return { adapter: 'claude', until: new Date(end).toISOString(), by };
}

// Date.parse reads a time with no zone as local time, so the end would move with the machine's zone.
function parseZonedTime(until: string | undefined): number {
  return until !== undefined && /(?:Z|[+-]\d{2}:\d{2})$/u.test(until) ? Date.parse(until) : Number.NaN;
}
