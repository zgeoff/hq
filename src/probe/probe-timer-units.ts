import { HqError } from '../errors.ts';

// The settings the probe reads that the installing shell may set: the local file's path and the URLs.
const PROBE_SETTINGS = ['HQ_LOCAL_CONFIG', 'HQ_PROBE_CONTROL', 'HQ_PROBE_READY', 'HQ_PROBE_TARGET'] as const;

export function buildProbeTimerUnits(hq: string, env: Record<string, string | undefined> = process.env): { service: string; timer: string } {
  const settings = PROBE_SETTINGS.flatMap((name) => buildSettingLine(name, env[name])).join('');
  return {
    service: `[Unit]\nDescription=hq probe: one check of Nix's /health/live and /health/ready\n\n[Service]\nType=oneshot\nEnvironment=PATH=${env['HOME']}/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-probe\n${settings}ExecStart=${hq} probe run\n`,
    timer: `[Unit]\nDescription=hq probe every minute\n\n[Timer]\nOnBootSec=1min\nOnUnitActiveSec=1min\nAccuracySec=5s\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

// One Environment= line, quoted; % is a systemd specifier, so it is doubled. A path or URL never
// holds a quote, a backslash or a newline, so one that does is refused.
function buildSettingLine(name: string, value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (/["\\\n\r]/u.test(value)) {
    throw new HqError('bad_config', `${name} holds a quote, a backslash or a newline, which the probe unit cannot carry`, { setting: name });
  }
  return [`Environment="${name}=${value.replaceAll('%', '%%')}"\n`];
}
