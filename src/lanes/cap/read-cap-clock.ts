import { now } from '../../clock/now.ts';
import { readWallClock } from '../../clock/read-wall-clock.ts';
import type { LanesCapArgs } from './parse-lanes-cap-args.ts';

export function readCapClock(args: LanesCapArgs): Date {
  return args.kind === 'show' ? now() : readWallClock();
}
