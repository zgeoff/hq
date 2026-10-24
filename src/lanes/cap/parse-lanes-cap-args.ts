import { z } from 'zod';
import { HqError } from '../../errors.ts';

export type LanesCapArgs = { kind: 'show' } | { kind: 'off'; reason: string | null } | { kind: 'set'; cap: number; until: string | null; reason: string | null };

const LANES_CAP_USAGE = 'hq lanes cap | cap <n> [--until <ISO time|Ddd HH:MM>] [--reason TEXT] | cap off [--reason TEXT]';

const COUNT = z
  .string()
  .regex(/^\d+$/u)
  .transform(Number)
  .pipe(z.number().int());

export function parseLanesCapArgs(rest: readonly string[], until: string | undefined, reason: string | undefined): LanesCapArgs {
  const [first, ...extra] = rest;
  if (extra.length > 0) {
    throw new HqError('bad_args', `unknown command: hq lanes cap ${rest.join(' ')}; ${LANES_CAP_USAGE}`);
  }
  const why = reason === undefined ? null : reason.trim();
  if (why === '') {
    throw new HqError('bad_args', `--reason must say why; ${LANES_CAP_USAGE}`);
  }
  if (first === undefined) {
    if (until !== undefined || why !== null) {
      throw new HqError('bad_args', `--until and --reason go with a cap to set; ${LANES_CAP_USAGE}`);
    }
    return { kind: 'show' };
  }
  if (first === 'off') {
    if (until !== undefined) {
      throw new HqError('bad_args', `cap off takes no --until; ${LANES_CAP_USAGE}`);
    }
    return { kind: 'off', reason: why };
  }
  const count = COUNT.safeParse(first);
  if (!count.success) {
    throw new HqError('bad_args', `hq lanes cap takes a whole number from 0, or off, not "${first.slice(0, 60)}"; ${LANES_CAP_USAGE}`);
  }
  return { kind: 'set', cap: count.data, until: until ?? null, reason: why };
}
