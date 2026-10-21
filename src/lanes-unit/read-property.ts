import { toExactOptional } from '@zgeoff/std';
import type { Runner } from '../runner/types.ts';
import { LANES_UNIT } from './lanes-unit.ts';

export async function readProperty(run: Runner, property: string, env?: Record<string, string | undefined>): Promise<string> {
  const r = await run(['systemctl', '--user', 'show', '-p', property, '--value', `${LANES_UNIT}.service`], toExactOptional({ env }));
  return r.stdout.trim();
}
