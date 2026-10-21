import { getHome as HOME } from './get-home.ts';

export function fleetTimerUnits(hq: string): { service: string; timer: string } {
  return {
    service: `[Unit]\nDescription=hq fleet ensure: respawn missing z- sessions\n\n[Service]\nType=oneshot\nEnvironment=PATH=${HOME()}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-fleet\nExecStart=${hq} fleet ensure\n`,
    timer: `[Unit]\nDescription=hq fleet ensure every 5 minutes\n\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=5min\n\n[Install]\nWantedBy=timers.target\n`,
  };
}
