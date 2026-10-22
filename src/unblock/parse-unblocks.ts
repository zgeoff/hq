import { HqError } from '../errors.ts';
import type { Priority } from './priorities.ts';
import { PRIORITIES } from './priorities.ts';
import type { Unblocked } from './types.ts';

// "GEO-778:urgent" -> { issue, priority }. The caller knows the priority; hq never guesses it.
export function parseUnblocks(raw: string): Unblocked[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [issue, pri = 'none'] = s.split(':');
      const priority = pri.toLowerCase() as Priority;
      if (!issue || !PRIORITIES.includes(priority)) {
        throw new HqError('bad_args', `cannot read "${s}": use ISSUE:priority, priority one of ${PRIORITIES.join('/')}`);
      }
      return { issue, priority };
    });
}
