import { buildUnitSettings } from '../fleet/build-unit-settings.ts';

export function buildProbeTimerUnits(hq: string, env: Record<string, string | undefined>): { service: string; timer: string } {
  return {
    service: `[Unit]\nDescription=hq probe: one check of Nix's /health/live and /health/ready\n\n[Service]\nType=oneshot\nEnvironment=PATH=${env['HOME']}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-probe\n${buildUnitSettings('probe', env)}ExecStart=${hq} probe run\n`,
    timer: `[Unit]\nDescription=hq probe every minute\n\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=1min\nAccuracySec=5s\n\n[Install]\nWantedBy=timers.target\n`,
  };
}
