import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installLanes } from '../src/lanes-unit/install-lanes.ts';
import { installedInterval } from '../src/lanes-unit/installed-interval.ts';
import { lanesEnv } from '../src/lanes-unit/lanes-env.ts';
import { lanesUnitFile } from '../src/lanes-unit/lanes-unit-file.ts';
import { stopLanes } from '../src/lanes-unit/stop-lanes.ts';
import { unitPath } from '../src/lanes-unit/unit-path.ts';
import type { Runner } from '../src/runner/types.ts';

let home: string;
beforeEach(() => {
  home = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-lanes-unit-'));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

// Records each systemctl call; `show` answers with the value given.
function fakeSystemctl(transient = 'no', fail: string | null = null): { run: Runner; calls: string[] } {
  const calls: string[] = [];
  const run: Runner = async (cmd) => {
    const line = cmd.join(' ');
    calls.push(line);
    if (fail && line.includes(fail)) return { code: 1, stdout: '', stderr: `invented failure on ${fail}` };
    if (cmd.includes('show')) return { code: 0, stdout: `${transient}\n`, stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls };
}

test('the unit restarts on failure, starts at login, and runs the watch with the interval', () => {
  const text = lanesUnitFile({ exec: ['/opt/invented/hq'], interval: 120, env: { HQ_AS: 'hq-lanes', PATH: '/usr/bin:/bin' } });
  expect(text).toContain('\nRestart=on-failure\n');
  expect(text).toContain('\nRestartSec=5\n');
  expect(text).toContain('\nRestartForceExitStatus=SIGTERM SIGINT SIGHUP\n');
  expect(text).toContain('[Install]\nWantedBy=default.target\n');
  expect(text).toContain('ExecStart="/opt/invented/hq" "lanes" "watch" "--interval" "120"\n');
  expect(text).toContain('Environment="HQ_AS=hq-lanes"\nEnvironment="PATH=/usr/bin:/bin"\n');
  expect(text).not.toContain('Transient');
  expect(installedInterval(text)).toBe(120);
});

test('quotes spaces, quotes, backslashes, % and $, and refuses a newline', () => {
  const text = lanesUnitFile({ exec: ['/opt/my tools/bun', '/srv/a"b\\c/cli.ts'], interval: 60, env: { HQ_NOTE: '50% of $HOME' } });
  expect(text).toContain('ExecStart="/opt/my tools/bun" "/srv/a\\"b\\\\c/cli.ts" "lanes"');
  expect(text).toContain('Environment="HQ_NOTE=50%% of $HOME"\n'); // Environment= expands no $
  // The executable word is not expanded: its $ stays; an argument's $ is doubled.
  expect(lanesUnitFile({ exec: ['/opt/$x/bun', '/opt/$y/cli.ts'], interval: 60, env: {} })).toContain('ExecStart="/opt/$x/bun" "/opt/$$y/cli.ts"');
  expect(() => lanesUnitFile({ exec: ['/opt/hq'], interval: 60, env: { HQ_BAD: 'one\ntwo' } })).toThrow('newline');
});

test("the unit carries hq's own settings and names itself hq-lanes", () => {
  const env = lanesEnv('/home/invented', { HQ_DB: '/data/hq.db', HQ_AS: 'z-someone', OTHER: 'dropped', HQ_UNSET: undefined });
  expect(env).toEqual({ PATH: '/home/invented/.local/bin:/home/invented/.bun/bin:/usr/local/bin:/usr/bin:/bin', HQ_DB: '/data/hq.db', HQ_AS: 'hq-lanes' });
});

test('it carries XDG_CONFIG_HOME, which locates the local settings file, into the watcher unit', () => {
  expect(lanesEnv('/home/invented', { XDG_CONFIG_HOME: '/srv/invented/config', HOME: '/home/invented' })).toStrictEqual({
    PATH: '/home/invented/.local/bin:/home/invented/.bun/bin:/usr/local/bin:/usr/bin:/bin',
    XDG_CONFIG_HOME: '/srv/invented/config',
    HQ_AS: 'hq-lanes',
  });
});

test('start writes the file, then reloads, enables and restarts the unit', async () => {
  const { run, calls } = fakeSystemctl('');
  const r = await installLanes(run, { home, exec: ['/opt/invented/hq'], interval: null, processEnv: {} });
  expect(r).toEqual({ path: `${home}/.config/systemd/user/hq-lanes.service`, interval: 300, replacedTransient: false });
  expect(readFileSync(r.path, 'utf8')).toContain('"--interval" "300"');
  expect(calls).toEqual([
    'systemctl --user show -p Transient --value hq-lanes.service',
    'systemctl --user daemon-reload',
    'systemctl --user enable hq-lanes.service',
    'systemctl --user restart hq-lanes.service',
  ]);
});

test('start stops a transient watcher from systemd-run before it installs the unit', async () => {
  const { run, calls } = fakeSystemctl('yes');
  const r = await installLanes(run, { home, exec: ['/opt/invented/hq'], interval: 90, processEnv: {} });
  expect(r.replacedTransient).toBe(true);
  expect(calls.slice(0, 3)).toEqual([
    'systemctl --user show -p Transient --value hq-lanes.service',
    'systemctl --user stop hq-lanes.service',
    'systemctl --user reset-failed hq-lanes.service',
  ]);
  expect(calls.at(-1)).toBe('systemctl --user restart hq-lanes.service');
});

test('a start without --interval keeps the installed interval; a bad interval or a failed step throws', async () => {
  const { run } = fakeSystemctl();
  await installLanes(run, { home, exec: ['/opt/invented/hq'], interval: 45, processEnv: {} });
  expect((await installLanes(run, { home, exec: ['/opt/invented/hq'], interval: null, processEnv: {} })).interval).toBe(45);
  for (const bad of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await expect(installLanes(run, { home, exec: ['/opt/invented/hq'], interval: bad, processEnv: {} })).rejects.toThrow('at least 1');
  }
  await expect(installLanes(fakeSystemctl('no', 'enable').run, { home, exec: ['/opt/invented/hq'], interval: 45, processEnv: {} })).rejects.toThrow('invented failure on enable');
});

test('stop stops the unit and disables an enabled one, so a reboot leaves it off', async () => {
  const enabled = fakeSystemctl('enabled');
  await stopLanes(enabled.run);
  expect(enabled.calls).toEqual([
    'systemctl --user stop hq-lanes.service',
    'systemctl --user show -p UnitFileState --value hq-lanes.service',
    'systemctl --user disable hq-lanes.service',
  ]);
  // A transient watcher from systemd-run has no unit file to disable.
  const transient = fakeSystemctl('transient');
  await stopLanes(transient.run);
  expect(transient.calls).toEqual(['systemctl --user stop hq-lanes.service', 'systemctl --user show -p UnitFileState --value hq-lanes.service']);
});

test('it refuses a stop whose unit-file state read fails, rather than skipping the disable', () => {
  const failed = fakeSystemctl('enabled', 'UnitFileState');

  expect(stopLanes(failed.run)).rejects.toMatchObject({ code: 'systemctl_failed', message: expect.stringContaining('invented failure on UnitFileState') });
});

test('it refuses a start whose transient read fails, before it writes the unit', () => {
  const failed = fakeSystemctl('no', 'Transient');

  expect(installLanes(failed.run, { home, exec: ['/opt/invented/hq'], interval: 60, processEnv: {} })).rejects.toMatchObject({ code: 'systemctl_failed' });
  expect(existsSync(unitPath(home))).toBe(false);
});

// install.sh with stub bun and systemctl on PATH: the stub build makes ~/.local/bin/hq a
// wrapper around this checkout, so install.sh and a direct `hq lanes start` run the same hq.
test('install.sh and hq lanes start write the same unit and make the same systemctl calls', async () => {
  const repo = join(import.meta.dir, '..');
  const bin = join(home, 'stub-bin');
  const log = join(home, 'systemctl.log');
  mkdirSync(bin, { recursive: true });
  const hq = join(home, '.local/bin/hq');
  writeFileSync(join(bin, 'bun'), `#!/bin/sh\nmkdir -p "$HOME/.local/bin"\nprintf '#!/bin/sh\\nexec "%s" "%s/src/cli.ts" "$@"\\n' '${process.execPath}' '${repo}' > "$HOME/.local/bin/hq"\nchmod +x "$HOME/.local/bin/hq"\n`);
  writeFileSync(
    join(bin, 'systemctl'),
    `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in *is-enabled*) exit 0 ;; *show*) echo no ;; esac\nexit 0\n`,
  );
  for (const f of ['bun', 'systemctl']) chmodSync(join(bin, f), 0o755);
  const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin`, HQ_DB: join(home, 'hq.db'), TMPDIR: home };
  const sh = (cmd: string[]) => Bun.spawnSync(cmd, { cwd: repo, env, stdout: 'pipe', stderr: 'pipe' });

  const a = sh(['sh', 'scripts/install.sh']);
  expect(a.stderr.toString()).toBe('');
  expect(a.stdout.toString()).toContain('hq-lanes restarted on');
  const viaInstall = { unit: readFileSync(unitPath(home), 'utf8'), calls: readFileSync(log, 'utf8') };

  rmSync(unitPath(home));
  rmSync(log);
  const b = sh([hq, 'lanes', 'start']);
  expect(b.exitCode).toBe(0);
  const viaStart = { unit: readFileSync(unitPath(home), 'utf8'), calls: readFileSync(log, 'utf8') };

  expect(viaInstall.unit).toBe(viaStart.unit);
  expect(viaInstall.unit).toContain('Restart=on-failure');
  // install.sh asks whether the unit is installed first; the rest is the same sequence.
  expect(viaInstall.calls).toBe(`--user is-enabled --quiet hq-lanes\n${viaStart.calls}`);
  expect(viaStart.calls).toBe('--user show -p Transient --value hq-lanes.service\n--user daemon-reload\n--user enable hq-lanes.service\n--user restart hq-lanes.service\n');
  expect(existsSync(join(home, '.config/systemd/user/hq-lanes.service'))).toBe(true);
}, 60_000);
