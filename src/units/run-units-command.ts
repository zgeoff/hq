import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { unitDir } from '../lanes-unit/unit-dir.ts';
import type { Runner } from '../runner/types.ts';
import { scrubUnits } from './scrub-units.ts';

interface UnitsCommand {
  verb: string | undefined;
  run: Runner;
  home: string;
  env: Record<string, string | undefined>;
}

export async function runUnitsCommand(command: UnitsCommand): Promise<Out> {
  if (command.verb !== 'scrub') {
    throw new HqError('bad_args', `unknown command: hq units ${command.verb ?? ''}`.trimEnd());
  }
  const scrubbed = await scrubUnits(command.run, { directory: unitDir(command.home), env: command.env });
  if (scrubbed.changed.length > 0) {
    return { data: { ...scrubbed }, text: `Removed HQ_NOW and HQ_QUIET from ${scrubbed.changed.join(', ')}; systemd reloaded.` };
  }
  return { data: { ...scrubbed }, text: scrubbed.reloaded ? 'No unit file sets HQ_NOW or HQ_QUIET, but systemd still held one; systemd reloaded.' : 'No unit sets HQ_NOW or HQ_QUIET.' };
}
