import { afterEach, beforeEach, expect, test } from 'bun:test';
import { toExactOptional } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { applyHealth } from '../src/health/apply-health.ts';
import { HEALTH_DEFAULTS } from '../src/health/health-defaults.ts';
import { healthSettings } from '../src/health/health-settings.ts';
import { runChecks } from '../src/health/run-checks.ts';
import { setHealthSetting } from '../src/health/set-health-setting.ts';
import type { Probe } from '../src/health/types.ts';
import { listNews } from '../src/news/list-news.ts';
import { probeHealth } from '../src/probe/probe-health.ts';
import type { Runner } from '../src/runner/types.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';
import { COMMAND_TIMEOUT_MS } from '../src/health/command-timeout-ms.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

interface World {
  broken?: boolean; // every systemctl and df call fails
  failedUser: string[];
  failedSystem: string[];
  restarts: Record<string, number>; // user services
  availBytes: number;
  tmpAvailBytes?: number;
  memSome60: number;
  atc: string | null;
  lanes: string;
}
const world = (over: Partial<World> = {}): World => ({ failedUser: [], failedSystem: [], restarts: { 'kettle.service': 0 }, availBytes: 400 * 2 ** 30, memSome60: 0, atc: null, lanes: 'active', ...over });

const calls: string[][] = [];
function probe(w: World): Probe {
  const run: Runner = async (cmd) => {
    calls.push(cmd);
    const line = cmd.join(' ');
    const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' });
    const readsState = cmd[0] === 'df' || (cmd[0] === 'systemctl' && !line.endsWith('is-active hq-lanes'));
    if (w.broken && readsState) return { code: 1, stdout: '', stderr: 'bus error' };
    if (line.includes('--state=failed')) return ok((cmd.includes('--user') ? w.failedUser : w.failedSystem).map((u) => `${u} loaded failed failed Some unit`).join('\n'));
    if (line.includes('--type=service')) return ok(cmd.includes('--user') ? Object.keys(w.restarts).map((u) => `${u} loaded active running X`).join('\n') : '');
    if (cmd[1] === '--user' && cmd[2] === 'show') return ok(Object.entries(w.restarts).map(([u, n]) => `Id=${u}\nNRestarts=${n}`).join('\n\n'));
    if (cmd[0] === 'df') return ok(`Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sdd ${1000 * 2 ** 30} 0 ${w.availBytes} 1% /\n/dev/sdd ${1000 * 2 ** 30} 0 ${w.availBytes} 1% /${cmd.includes('/tmp') ? `\ntmpfs ${16 * 2 ** 30} 0 ${w.tmpAvailBytes ?? 15 * 2 ** 30} 7% /tmp` : ''}`);
    if (line.endsWith('is-active hq-lanes')) return { code: w.lanes === 'active' ? 0 : 3, stdout: `${w.lanes}\n`, stderr: '' };
    return ok('');
  };
  return {
    run,
    readFile: async (p) => (p.endsWith('pressure/memory') ? `some avg10=0.00 avg60=${w.memSome60} avg300=0.00 total=1\nfull avg10=0 avg60=0 avg300=0 total=1` : 'MemTotal: 1000000 kB\nMemAvailable: 500000 kB'),
    atcAnswers: async () => w.atc,
    home: '/home/someone',
  };
}

async function step(w: World, minute: number) {
  at(new Date(Date.parse(NOON_SYDNEY) + minute * 60_000).toISOString());
  const prev = JSON.parse((db.query("SELECT value FROM meta WHERE key = 'health_samples'").get() as { value: string } | null)?.value ?? '{}');
  const { checks, samples, unknown } = await runChecks(probe(w), healthSettings(db), prev, new Date(Date.parse(NOON_SYDNEY) + minute * 60_000));
  return applyHealth(db, checks, samples, 'hq-lanes', unknown);
}
const outbox = () => db.query('SELECT target, text FROM outbox').all() as { target: string; text: string }[];

test('all clear sends nothing', async () => {
  const r = await step(world(), 0);
  expect(r.checks.every((c) => c.ok)).toBe(true);
  expect(outbox()).toHaveLength(0);
});

test('a new problem tells z-stu once, in one message per tick; clearing files news', async () => {
  await step(world({ failedUser: ['teapot.service', 'run-r123.service'], availBytes: 2 * 2 ** 30 }), 0);
  expect(outbox()).toHaveLength(1);
  const m = outbox()[0]!;
  expect(m.target).toBe('z-stu');
  expect(m.text).toContain('2 new problems');
  expect(m.text).toContain('user unit teapot.service has failed');
  expect(m.text).toContain('disk /: 2.0 GiB free');
  expect(m.text).not.toContain('run-r123'); // ignored by default
  await step(world({ failedUser: ['teapot.service'], availBytes: 2 * 2 ** 30 }), 5);
  expect(outbox()).toHaveLength(1); // nothing new
  await step(world(), 10);
  expect(outbox()).toHaveLength(1);
  expect(listNews(db, { all: false, limit: 10 }).map((n) => n.text)).toEqual([
    expect.stringContaining('Cleared: user unit teapot.service has failed'),
    expect.stringContaining('Cleared: disk /'),
  ]);
});

test('a restart loop trips on restarts gained inside the window, and clears when it stops', async () => {
  await step(world({ restarts: { 'kettle.service': 100 } }), 0);
  await step(world({ restarts: { 'kettle.service': 103 } }), 5);
  expect(outbox()).toHaveLength(0);
  const r = await step(world({ restarts: { 'kettle.service': 106 } }), 10);
  expect(r.opened.map((c) => c.line)).toEqual(['user unit kettle.service is restart-looping: 6 restarts in 30 min (NRestarts 106)']);
  const r2 = await step(world({ restarts: { 'kettle.service': 106 } }), 36); // the 100 sample left the window
  expect(r2.cleared.map((c) => c.key)).toEqual(['restart-loop:user:kettle.service']);
});

test('atc down, pressure high and the watcher inactive are problems', async () => {
  const r = await step(world({ atc: 'connect ENOENT', memSome60: 35, lanes: 'inactive' }), 0);
  expect(r.opened.map((c) => c.key).sort()).toEqual(['atc', 'hq-lanes', 'memory:pressure']);
});

test('settings change thresholds and refuse nonsense; checks only read', async () => {
  expect(healthSettings(db)).toEqual(HEALTH_DEFAULTS);
  setHealthSetting(db, 'diskMinGiB', '1', 'z-stu');
  setHealthSetting(db, 'diskMinPct', '0', 'z-stu');
  calls.length = 0;
  expect((await step(world({ availBytes: 2 * 2 ** 30 }), 0)).opened).toHaveLength(0);
  expect(() => setHealthSetting(db, 'nope', '1', 'z-stu')).toThrow('unknown setting');
  expect(() => setHealthSetting(db, 'restarts', '-1', 'z-stu')).toThrow('0 or more');
  expect(setHealthSetting(db, 'diskMinGiB', null, 'z-stu').diskMinGiB).toBe(5);
  const verbs = new Set(calls.filter((c) => c[0] === 'systemctl').map((c) => c.find((a) => !a.startsWith('-') && a !== 'systemctl')));
  expect([...verbs].sort()).toEqual(['is-active', 'list-units', 'show']);
});

test('a failed read neither clears open problems nor drops restart samples', async () => {
  await step(world({ failedUser: ['teapot.service'], availBytes: 2 * 2 ** 30, restarts: { 'kettle.service': 100 } }), 0);
  expect(outbox()).toHaveLength(1);
  const r = await step(world({ broken: true }), 5);
  expect(r.cleared).toEqual([]);
  expect(r.opened.map((c) => c.key).sort()).toEqual(['disk', 'systemd:system', 'systemd:user']);
  await step(world({ failedUser: ['teapot.service'], availBytes: 2 * 2 ** 30, restarts: { 'kettle.service': 106 } }), 10);
  const texts = outbox().map((m) => m.text);
  expect(texts.filter((t) => t.includes('teapot.service'))).toHaveLength(1); // no second alert
  expect(texts.at(-1)).toContain('kettle.service is restart-looping'); // the 100 sample survived the failed read
});

test('a command that hangs counts as a failed read', async () => {
  const p = probe(world());
  const hang: Probe = { ...p, run: async (cmd) => (cmd[0] === 'df' ? new Promise(() => {}) : p.run(cmd)) };
  expect(COMMAND_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  const started = Date.now();
  const orig = setTimeout;
  // Speed the timer: run the check with a short timeout through a patched clock.
  (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, _ms: number) => orig(fn, 10)) as typeof setTimeout;
  try {
    const { unknown } = await runChecks(hang, healthSettings(db), {}, new Date(NOON_SYDNEY));
    expect(unknown).toContain('disk:');
  } finally {
    (globalThis as { setTimeout: unknown }).setTimeout = orig;
  }
  expect(Date.now() - started).toBeLessThan(5_000);
});

test('a stale or failing backup is a problem once hq backup has run', async () => {
  const p = probe(world()),
    run = async (b: Probe['backup']) => {
      const result = await runChecks(toExactOptional({ ...p, backup: b }), healthSettings(db), {}, t);
      return result.checks.find((c) => c.key === 'backup');
    },
    t = new Date(NOON_SYDNEY);
  expect(await run(() => ({ lastOk: null, lastError: null, everRan: false }))).toBeUndefined();
  expect((await run(() => ({ lastOk: new Date(t.getTime() - 3_600_000).toISOString(), lastError: null, everRan: true })))!.ok).toBe(true);
  const stale = await run(() => ({ lastOk: new Date(t.getTime() - 4 * 3_600_000).toISOString(), lastError: 'restic copy failed', everRan: true }));
  expect(stale).toMatchObject({ ok: false, line: 'hq backup: no good backup in 4.0 h; last error: restic copy failed' });
});

test('a full /tmp is a problem, as a full disk is', async () => {
  const p = probe(world({ tmpAvailBytes: 0 }));
  const { checks } = await runChecks(p, HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY));
  expect(checks.find((c) => c.key === 'disk:/tmp')).toMatchObject({ ok: false, line: expect.stringContaining('disk /tmp: 0.0 GiB free (0%)') });
  const fine = await runChecks(probe(world()), HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY));
  expect(fine.checks.find((c) => c.key === 'disk:/tmp')).toMatchObject({ ok: true });
});

test('the nix probe check is red when stale or while an outage is open, and quiet with no samples', async () => {
  const w = world();
  const at0 = new Date(NOON_SYDNEY);
  const ask = async (m: number) => (await runChecks({ ...probe(w), probe: (t) => probeHealth(db, t) }, healthSettings(db), {}, new Date(at0.getTime() + m * 60_000))).checks.find((c) => c.key === 'nix-probe');
  expect(await ask(0)).toMatchObject({ ok: true, line: expect.stringContaining('no samples') });
  db.query(`INSERT INTO probe_samples (at, target_ok, control_ok, ms) VALUES (?, 1, NULL, 20)`).run(NOON_SYDNEY);
  expect((await ask(2))?.ok).toBe(true);
  expect(await ask(7)).toMatchObject({ ok: false, line: expect.stringContaining('stopped') });
  db.query(`INSERT INTO outages (started_at, detected_at) VALUES (?, ?)`).run(NOON_SYDNEY, NOON_SYDNEY);
  expect(await ask(2)).toMatchObject({ ok: false, line: expect.stringContaining('Nix is down') });
});

test('the local settings check joins the run when the probe supplies it, and is absent otherwise', async () => {
  const none = await runChecks(probe(world()), HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY)),
    some = await runChecks({ ...probe(world()), localConfig: () => ({ key: 'local-config', ok: false, line: 'local settings: HQ_PROBE_READY not set' }) }, HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY));
  expect([none.checks.some((c) => c.key === 'local-config'), some.checks.find((c) => c.key === 'local-config')]).toStrictEqual([false, { key: 'local-config', ok: false, line: 'local settings: HQ_PROBE_READY not set' }]);
});

test('the private-tree check joins the run when the probe supplies it, and is absent otherwise', async () => {
  const none = await runChecks(probe(world()), HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY)),
    some = await runChecks({ ...probe(world()), privateTree: () => ({ key: 'private-tree', ok: false, line: 'hq-private: no checkout' }) }, HEALTH_DEFAULTS, {}, new Date(NOON_SYDNEY));
  expect([none.checks.some((c) => c.key === 'private-tree'), some.checks.find((c) => c.key === 'private-tree')]).toStrictEqual([false, { key: 'private-tree', ok: false, line: 'hq-private: no checkout' }]);
});
