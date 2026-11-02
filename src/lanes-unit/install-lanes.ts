import { toExactOptional } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { DEFAULT_INTERVAL } from './default-interval.ts';
import { installedInterval } from './installed-interval.ts';
import { lanesEnv } from './lanes-env.ts';
import { lanesUnitFile } from './lanes-unit-file.ts';
import { LANES_UNIT } from './lanes-unit.ts';
import { readProperty } from './read-property.ts';
import { runSystemctl as systemctl } from './run-systemctl.ts';
import type { InstallResult } from './types.ts';
import { unitPath } from './unit-path.ts';

// A transient unit of the same name from systemd-run shadows the file: stop it first, and systemd
// drops it (it ran with --collect).
export async function installLanes(
  run: Runner,
  o: { home: string; exec: string[]; interval: number | null; processEnv: Record<string, string | undefined>; env?: Record<string, string | undefined> },
): Promise<InstallResult> {
  if (o.interval !== null && (!Number.isSafeInteger(o.interval) || o.interval < 1)) throw new HqError('bad_args', '--interval must be a whole number of seconds, at least 1');
  const transient = (await readProperty(run, 'Transient', o.env)) === 'yes';
  const path = unitPath(o.home);
  const file = Bun.file(path);
  const interval = o.interval ?? installedInterval((await file.exists()) ? await file.text() : null) ?? DEFAULT_INTERVAL;
  if (transient) {
    await systemctl(run, ['stop', `${LANES_UNIT}.service`], o.env);

    // a no-op unless it failed
    await run(['systemctl', '--user', 'reset-failed', `${LANES_UNIT}.service`], toExactOptional({ env: o.env }));
  }
  await Bun.write(path, lanesUnitFile({ exec: o.exec, interval, env: lanesEnv(o.home, o.processEnv) }));
  await systemctl(run, ['daemon-reload'], o.env);
  await systemctl(run, ['enable', `${LANES_UNIT}.service`], o.env);
  await systemctl(run, ['restart', `${LANES_UNIT}.service`], o.env);
  return { path, interval, replacedTransient: transient };
}
