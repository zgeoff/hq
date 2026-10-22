import type { Runner } from '../runner/types.ts';
import { LANES_UNIT } from './lanes-unit.ts';
import { runSystemctl } from './run-systemctl.ts';

// `systemctl show` answers a unit that does not exist with exit 0 and an empty or default value, so
// a non-zero exit is a real failure and throws.
export async function readProperty(run: Runner, property: string, env?: Record<string, string | undefined>): Promise<string> {
  const value = await runSystemctl(run, ['show', '-p', property, '--value', `${LANES_UNIT}.service`], env);
  return value.trim();
}
