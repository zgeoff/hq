import { CLOCK_OVERRIDES } from '../clock/clock-overrides.ts';
import { runSystemctl } from '../lanes-unit/run-systemctl.ts';
import type { Runner } from '../runner/types.ts';

// systemctl show prints the loaded Environment= as space-separated assignments, quoting one that holds a space.
const LOADED_CLOCK_SETTING = new RegExp(`(?:^|[\\s"])(?:${CLOCK_OVERRIDES.join('|')})=`, 'u');

export async function probeLoadedClockSetting(run: Runner, services: string[], env?: Record<string, string | undefined>): Promise<boolean> {
  for (const service of services) {
    const loaded = await runSystemctl(run, ['show', '-p', 'Environment', '--value', service], env);
    if (LOADED_CLOCK_SETTING.test(loaded)) {
      return true;
    }
  }
  return false;
}
