import { resolve } from 'node:path';
import { buildEnvironmentLine } from './build-environment-line.ts';

// The service runs with systemd's environment, not the installing shell's, so it carries the
// shell's HQ_* settings; HQ_DB is made absolute because the service runs from another directory.
export function fleetTimerUnits(hq: string, env: Record<string, string | undefined> = process.env): { service: string; timer: string } {
  const settings = Object.entries(env)
    .filter(([name]) => name.startsWith('HQ_') && name !== 'HQ_AS')
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, value]) => buildEnvironmentLine('fleet', name, resolveSetting(name, value)))
    .join('');
  return {
    service: `[Unit]\nDescription=hq fleet ensure: respawn missing z- sessions\n\n[Service]\nType=oneshot\nEnvironment=PATH=${env['HOME'] ?? '/'}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-fleet\n${settings}ExecStart=${hq} fleet ensure\n`,
    timer: `[Unit]\nDescription=hq fleet ensure every 5 minutes\n\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=5min\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

function resolveSetting(name: string, value: string | undefined): string | undefined {
  return name === 'HQ_DB' && value ? resolve(value) : value;
}
