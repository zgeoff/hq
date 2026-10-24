import { toExactOptional } from '@zgeoff/std';
import { BACKUP_UNIT } from '../backup/backup-unit.ts';
import { HqError } from '../errors.ts';
import { FLEET_UNIT } from '../fleet/fleet-unit.ts';
import { LANES_UNIT } from '../lanes-unit/lanes-unit.ts';
import { PROBE_UNIT } from '../probe/probe-unit.ts';
import type { Runner } from '../runner/types.ts';
import { stripClockSettings } from './strip-clock-settings.ts';

const SERVICES = [LANES_UNIT, FLEET_UNIT, BACKUP_UNIT, PROBE_UNIT].map((unit) => `${unit}.service`);

// Rewrite each hq service file that sets a clock override, then reload systemd if any changed.
// Returns the files it changed; a missing directory or file is skipped.
export async function scrubUnits(run: Runner, scrub: { directory: string; env?: Record<string, string | undefined> }): Promise<string[]> {
  const changed: string[] = [];
  for (const service of SERVICES) {
    const file = Bun.file(`${scrub.directory}/${service}`);
    if (!(await file.exists())) {
      continue;
    }
    const before = await file.text();
    const after = stripClockSettings(before);
    if (after !== before) {
      await Bun.write(file, after);
      changed.push(service);
    }
  }
  if (changed.length > 0) {
    const reloaded = await run(['systemctl', '--user', 'daemon-reload'], toExactOptional({ env: scrub.env }));
    if (reloaded.code !== 0) {
      throw new HqError('systemctl_failed', `systemctl --user daemon-reload: ${(reloaded.stderr || reloaded.stdout).trim()}`);
    }
  }
  return changed;
}
