import { toExactOptional } from '@zgeoff/std';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';

interface TimerRemoval {
  directory: string;
  unit: string;
  env?: Record<string, string | undefined>;
}

// Turn a user timer off, then delete its unit files. A failed disable stops before the files go, so
// the reported state stays true; a timer that is not installed is already off.
export async function removeTimer(run: Runner, removal: TimerRemoval): Promise<void> {
  const disabled = await run(['systemctl', '--user', 'disable', '--now', `${removal.unit}.timer`], toExactOptional({ env: removal.env }));
  if (disabled.code !== 0 && !/does not exist|not loaded/u.test(disabled.stderr)) {
    throw new HqError('timer_failed', `systemctl --user disable --now ${removal.unit}.timer: ${(disabled.stderr || disabled.stdout).trim()}`);
  }
  for (const file of [`${removal.unit}.service`, `${removal.unit}.timer`]) {
    await Bun.file(`${removal.directory}/${file}`)
      .delete()
      .catch(() => {});
  }
  const reloaded = await run(['systemctl', '--user', 'daemon-reload'], toExactOptional({ env: removal.env }));
  if (reloaded.code !== 0) {
    throw new HqError('timer_failed', `systemctl --user daemon-reload: ${(reloaded.stderr || reloaded.stdout).trim()}`);
  }
}
