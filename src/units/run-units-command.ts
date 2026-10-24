import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { unitDir } from '../lanes-unit/unit-dir.ts';
import type { Runner } from '../runner/types.ts';
import { scrubUnits } from './scrub-units.ts';

export async function runUnitsCommand(o: { verb: string | undefined; run: Runner; home: string; env?: Record<string, string | undefined> }): Promise<Out> {
  if (o.verb !== 'scrub') {
    throw new HqError('bad_args', 'hq units scrub');
  }
  const changed = await scrubUnits(o.run, { directory: unitDir(o.home), ...(o.env ? { env: o.env } : {}) });
  return {
    data: { changed },
    text: changed.length > 0 ? `Removed HQ_NOW and HQ_QUIET from ${changed.join(', ')}; systemd reloaded.` : 'No unit sets HQ_NOW or HQ_QUIET.',
  };
}
