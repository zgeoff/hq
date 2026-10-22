import { HqError } from '../errors.ts';
import { LANES_UNIT } from './lanes-unit.ts';
import { RESTART_SEC } from './restart-sec.ts';
import type { LanesUnitOpts } from './types.ts';

// Restart=on-failure brings a crashed watcher back. SIGTERM, SIGINT and SIGHUP
// count as clean exits for on-failure, so a plain `kill` would leave it down;
// RestartForceExitStatus restarts after those too. `systemctl stop` still stops it.
export function lanesUnitFile(o: LanesUnitOpts): string {
  const env = Object.entries(o.env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `Environment=${quote(`${k}=${v}`, false)}\n`)
    .join('');
  // systemd expands $ in the arguments, not in the executable word: escape it only there.
  const exec = [...o.exec, 'lanes', 'watch', '--interval', String(o.interval)].map((w, i) => quote(w, i > 0)).join(' ');
  return (
    `[Unit]\nDescription=hq lanes watcher: nudges the orchestrator when slots are free\n\n` +
    `[Service]\nType=simple\n${env}ExecStart=${exec}\nRestart=on-failure\nRestartSec=${RESTART_SEC}\nRestartForceExitStatus=SIGTERM SIGINT SIGHUP\n\n` +
    `[Install]\nWantedBy=default.target\n`
  );
}

// One word of a unit file, in double quotes: % starts a specifier, and in
// ExecStart= $ starts a variable. A newline can't be quoted, so it's refused.
function quote(s: string, exec: boolean): string {
  if (/[\n\r]/.test(s)) throw new HqError('bad_args', `a newline can't go in the ${LANES_UNIT} unit: ${JSON.stringify(s)}`);
  let q = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  if (exec) q = q.replace(/\$/g, '$$$$');
  return `"${q}"`;
}
