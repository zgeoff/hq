import { now } from '../../clock/now.ts';
import type { LanesCapArgs } from './parse-lanes-cap-args.ts';

// A change reads the wall clock, never HQ_NOW: the caller sets HQ_NOW, and a pinned future time
// would read the owner's cap as ended and let z-delivery replace it.
export function readCapClock(args: LanesCapArgs): Date {
  return args.kind === 'show' ? now() : new Date();
}
