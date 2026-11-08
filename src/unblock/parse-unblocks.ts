import { isOneOf } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import { PRIORITIES } from './priorities.ts';
import type { Unblocked } from './types.ts';

export function parseUnblocks(raw: string): Unblocked[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [issue, pri = 'none'] = s.split(':');
      const priority = pri.toLowerCase();
      if (!issue || !isOneOf(priority, PRIORITIES)) {
        throw new HqError('bad_args', `cannot read "${s}": use ISSUE:priority, priority one of ${PRIORITIES.join('/')}`);
      }
      return { issue, priority };
    });
}
