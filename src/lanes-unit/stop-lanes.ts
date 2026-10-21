import type { Runner } from '../runner/types.ts';
import { LANES_UNIT } from './lanes-unit.ts';
import { readProperty } from './read-property.ts';
import { runSystemctl as systemctl } from './run-systemctl.ts';

// Stop it and keep it off after a reboot. The unit file stays for the next start.
// Disable only an enabled unit file: a transient watcher from systemd-run has none.
export async function stopLanes(run: Runner, env?: Record<string, string | undefined>): Promise<void> {
  await systemctl(run, ['stop', `${LANES_UNIT}.service`], env);
  const state = await readProperty(run, 'UnitFileState', env);
  if (state === 'enabled') {
    await systemctl(run, ['disable', `${LANES_UNIT}.service`], env);
  }
}
