import { buildUnitSettings } from './build-unit-settings.ts';

export function fleetTimerUnits(hq: string, env: Record<string, string | undefined>): { service: string; timer: string } {
  return {
    service: `[Unit]\nDescription=hq fleet ensure: respawn missing z- sessions\n\n[Service]\nType=oneshot\nEnvironment=PATH=${env['HOME'] ?? '/'}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-fleet\n${buildUnitSettings('fleet', env)}ExecStart=${hq} fleet ensure\n`,
    timer: `[Unit]\nDescription=hq fleet ensure every 5 minutes\n\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=5min\n\n[Install]\nWantedBy=timers.target\n`,
  };
}
