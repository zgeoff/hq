import { BACKUP_UNIT } from '../backup/backup-unit.ts';
import { FLEET_UNIT } from '../fleet/fleet-unit.ts';
import { LANES_UNIT } from '../lanes-unit/lanes-unit.ts';
import { runSystemctl } from '../lanes-unit/run-systemctl.ts';
import { PROBE_UNIT } from '../probe/probe-unit.ts';
import type { Runner } from '../runner/types.ts';
import { probeLoadedClockSetting } from './probe-loaded-clock-setting.ts';
import { stripClockSettings } from './strip-clock-settings.ts';

interface Scrub {
  directory: string;
  env?: Record<string, string | undefined>;
}

interface Scrubbed {
  changed: string[];
  reloaded: boolean;
}

const SERVICES = [LANES_UNIT, FLEET_UNIT, BACKUP_UNIT, PROBE_UNIT].map((unit) => `${unit}.service`);

export async function scrubUnits(run: Runner, scrub: Scrub): Promise<Scrubbed> {
  const present: string[] = [];
  const changed: string[] = [];
  for (const service of SERVICES) {
    const file = Bun.file(`${scrub.directory}/${service}`);
    if (!(await file.exists())) {
      continue;
    }
    present.push(service);
    const before = await file.text();
    const after = stripClockSettings(before);
    if (after !== before) {
      await Bun.write(file, after);
      changed.push(service);
    }
  }

  // Clean files are not enough: after an earlier scrub's reload failed, systemd still runs the old settings.
  const loadedStale = changed.length === 0 ? await probeLoadedClockSetting(run, present, scrub.env) : false;
  const reloaded = changed.length > 0 || loadedStale;
  if (reloaded) {
    await runSystemctl(run, ['daemon-reload'], scrub.env);
  }
  return { changed, reloaded };
}
