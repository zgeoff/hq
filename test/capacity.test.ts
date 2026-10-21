import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { owner } from '../src/owner.ts';
import { loadCapacityLine } from '../src/capacity/load-capacity-line.ts';
import { capacitySettings } from '../src/capacity/capacity-settings.ts';
import { latestSample } from '../src/capacity/latest-sample.ts';
import { openAlerts } from '../src/capacity/open-alerts.ts';
import { promValue } from '../src/capacity/prom-value.ts';
import { readCapacity } from '../src/capacity/read-capacity.ts';
import { readImpd } from '../src/capacity/read-impd.ts';
import { sampleCapacity } from '../src/capacity/sample-capacity.ts';
import { sampleLog } from '../src/capacity/sample-log.ts';
import { setCapacitySetting } from '../src/capacity/set-capacity-setting.ts';
import type { CapacityProbe } from '../src/capacity/types.ts';
import { dailyText } from '../src/goals/daily/daily-text.ts';
import { kdb } from '../src/kdb.ts';
import type { Runner } from '../src/runner/types.ts';
import { orchestratorName } from '../src/wake/orchestrator-name.ts';
import { FOUR_AM_SYDNEY, NOON_SYDNEY, at, freshDb } from './helpers.ts';

let db: Database;
let cleanup: () => void;
beforeEach(() => {
  ({ db, cleanup } = freshDb());
  at(NOON_SYDNEY);
});
afterEach(() => cleanup());

interface World {
  nonnix: number; // MiB awake, non-Nix
  nix: number;
  used: number;
  cloudAvail: number; // GiB
  plugged?: number; // MiB plugged into the elastic non-Nix imp
  impzBroken?: boolean;
  impzHangs?: boolean;
  cloudBroken?: boolean;
  cloudHangs?: boolean;
  metrics?: string;
}
const world = (over: Partial<World> = {}): World => ({ nonnix: 8192, nix: 4096, used: 10240, cloudAvail: 14, ...over });

function probe(w: World): CapacityProbe {
  const run: Runner = async (cmd) => {
    const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' });
    if (cmd[0] === 'impz') {
      if (w.impzHangs) return new Promise(() => {});
      if (w.impzBroken) return { code: 1, stdout: '', stderr: 'daemon down' };
      if (cmd[1] === 'info') return ok(JSON.stringify({ ramBudgetMib: 20480, ramUsedMib: w.used, ramCommittedMib: 12288 }));
      const imp = (name: string, state: string, memoryMib: number) => ({ name, state, memoryMib, ...(name === 'kettle-1' && w.plugged ? { pluggedMib: w.plugged } : {}) });
      return ok(JSON.stringify([imp('nixie-a', 'running', w.nix), imp('kettle-1', 'running', w.nonnix), imp('kettle-2', 'sleeping', 4096)].map((i) => Object.assign(i, { vcpus: 2 }))));
    }
    if (cmd[0] === 'df') return ok(`Filesystem 1-blocks Used Available Capacity Mounted on\n/dev/sdd ${1000 * 2 ** 30} 0 ${120 * 2 ** 30} 1% /`);
    return ok('');
  };
  return {
    run,
    readText: () => {
      if (w.cloudHangs) return new Promise<string>(() => {});
      if (w.cloudBroken) {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve(w.metrics ?? `# HELP x\nnode_memory_MemAvailable_bytes ${w.cloudAvail * 2 ** 30}\nnode_memory_MemTotal_bytes 3.3635024896e+10\n`);
    },
    readFile: async () => 'MemTotal: 16000000 kB\nMemAvailable: 9544371 kB\n',
    readMs: 100,
  };
}

const minute = (m: number) => new Date(Date.parse(NOON_SYDNEY) + m * 60_000);
const outbox = () => db.query('SELECT target, text, topic FROM outbox ORDER BY id').all() as { target: string; text: string; topic: string | null }[];
const sampleAt = async (w: World, d: Date) => {
  at(d.toISOString());
  return sampleCapacity(db, probe(w), 'hq-lanes', d);
};
const usage = (when: Date, five: number, seven: number) =>
  db.query('INSERT OR REPLACE INTO usage_samples (at, account, five_hour, seven_day) VALUES (?, ?, ?, ?)').run(when.toISOString().replace(/\.\d{3}Z$/, 'Z'), 'abcdef012345', five, seven);

test('the Kysely adapter inserts and selects through hq\'s own database', async () => {
  const k = kdb(db);
  await k.insertInto('capacity_samples').values({ at: '2026-10-14T01:00:00Z', impd_budget_mib: 100, impd_used_mib: null, impd_committed_mib: null, nonnix_awake_mib: 7, nix_awake_mib: null, cloud_avail_bytes: null, cloud_total_bytes: null, claude_account: null, claude_five_hour: 1.5, claude_seven_day: null, claude_at: null, ci_minutes_today: null, pc_disk_free_bytes: null, pc_mem_avail_bytes: null, errors: '{}' }).execute();
  const rows = await k.selectFrom('capacity_samples').selectAll().execute();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ impd_budget_mib: 100, nonnix_awake_mib: 7, claude_five_hour: 1.5, impd_used_mib: null });
  expect(db.query('SELECT COUNT(*) AS n FROM capacity_samples').get()).toEqual({ n: 1 }); // close() left hq's database open
  await k.destroy();
  expect(db.query('SELECT 1 AS x').get()).toEqual({ x: 1 });
});

test('impd: info gives the budget, ls splits the awake imps into Nix and the rest, sleeping ones do not count', async () => {
  const r = await readImpd(probe(world()));
  expect(r).toEqual({ impd: { budgetMib: 20_480, usedMib: 10_240, committedMib: 12_288, nonnixAwakeMib: 8192, nonnixAwakeVcpus: 2, nixAwakeMib: 4096 }, error: null });
});

test('impd: the awake non-Nix imps\' vCPUs are counted, Nix and sleeping ones left out; one with none makes the count unknown', async () => {
  const counted = await readImpd(buildImpzProbe([
      { name: 'nixie-a', state: 'running', memoryMib: 1024, vcpus: 1 },
      { name: 'kettle-1', state: 'running', memoryMib: 2048, vcpus: 2 },
      { name: 'kettle-2', state: 'running', memoryMib: 2048, vcpus: 4 },
      { name: 'kettle-3', state: 'sleeping', memoryMib: 2048 },
    ])),
    unknown = await readImpd(buildImpzProbe([{ name: 'kettle-1', state: 'running', memoryMib: 2048 }]));
  expect([counted.impd.nonnixAwakeVcpus, counted.impd.nonnixAwakeMib, unknown.impd.nonnixAwakeVcpus, unknown.impd.nonnixAwakeMib]).toStrictEqual([6, 4096, null, 2048]);
});

test('prometheus text: exponent form parses, a missing metric is null', () => {
  expect(promValue('node_memory_MemTotal_bytes 3.3635024896e+10\n', 'node_memory_MemTotal_bytes')).toBe(33635024896);
  expect(promValue('node_memory_MemAvailable_bytes{a="b"} 1.5e+10', 'node_memory_MemAvailable_bytes')).toBe(1.5e10);
  expect(promValue('node_memory_MemAvailable_bytes_total 5\n', 'node_memory_MemAvailable_bytes')).toBeNull();
  expect(promValue('other 1\n', 'node_memory_MemAvailable_bytes')).toBeNull();
});

test('a reading carries every source; PC and CI are shown', async () => {
  usage(minute(-5), 40, 62);
  const r = await readCapacity(db, probe(world()), minute(0));
  expect(r).toMatchObject({ nonnix_awake_mib: 8192, nix_awake_mib: 4096, impd_budget_mib: 20480, cloud_avail_bytes: 14 * 2 ** 30, cloud_total_bytes: 33635024896, claude_account: 'abcdef012345', claude_five_hour: 40, claude_seven_day: 62, ci_minutes_today: 0, pc_disk_free_bytes: 120 * 2 ** 30, pc_mem_avail_bytes: 9544371 * 1024, errors: {} });
});

test('CI minutes today count the Sydney day from the goals CI runs', async () => {
  db.query("INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (1, 'atc', 'ci.yml', 'push', 'completed', 'success', 1, '2026-10-14T00:10:00Z', '2026-10-14T00:10:00Z', '2026-10-14T00:40:00Z')").run();
  expect((await readCapacity(db, probe(world()), minute(0))).ci_minutes_today).toBe(30);
});

test('a failed, malformed or hung source stores NULLs and an errors entry; the others still read', async () => {
  const bad = await readCapacity(db, probe(world({ impzBroken: true, cloudBroken: true })), minute(0));
  expect(bad).toMatchObject({ nonnix_awake_mib: null, impd_budget_mib: null, cloud_avail_bytes: null, pc_disk_free_bytes: 120 * 2 ** 30 });
  expect(Object.keys(bad.errors).toSorted()).toEqual(['claude', 'cloud', 'impd', 'op']);
  const missing = await readCapacity(db, probe(world({ metrics: 'node_memory_MemTotal_bytes 5\n' })), minute(0));
  expect(missing.cloud_avail_bytes).toBeNull();
  expect(missing.errors['cloud']).toContain('MemAvailable');

  const t = Date.now();
  const hung = await readCapacity(db, { ...probe(world({ cloudHangs: true })), run: (cmd) => (cmd[0] === 'impz' ? new Promise(() => {}) : probe(world()).run(cmd)) }, minute(0));
  expect(Date.now() - t).toBeLessThan(5_000); // each read gives up at its own deadline
  expect(hung.cloud_avail_bytes).toBeNull();
  expect(hung.errors['cloud']).toContain('no answer');
}, 60_000);

test('a Claude sample older than 30 minutes is no reading', async () => {
  usage(minute(-40), 40, 62);
  const r = await readCapacity(db, probe(world()), minute(0));
  expect(r.claude_seven_day).toBeNull();
  expect(r.errors['claude']).toContain('old');
});

test('a breach must hold two samples to open; one is not enough', async () => {
  await sampleAt(world({ nonnix: 18_432 }), minute(0));
  expect(outbox()).toHaveLength(0);
  expect(openAlerts(db)).toEqual({});
  await sampleAt(world({ nonnix: 16_000 }), minute(5)); // back under: the count restarts
  await sampleAt(world({ nonnix: 18_432 }), minute(10));
  expect(outbox()).toHaveLength(0);
  const t = await sampleAt(world({ nonnix: 18_432 }), minute(15));
  expect(t.tick.opened).toEqual(['impd:nonnix']);
  const sent = outbox();
  expect(sent.map((m) => m.target).sort()).toEqual([owner(), orchestratorName()].sort());
  expect(sent[0]!.text).toContain('- impd: non-Nix imps awake 18,432 MiB, over 16,384 MiB (budget used 10,240/20,480)');
  expect(sent[0]!.text).toContain('hq capacity shows every reading. hq changed nothing.');
  expect(sent[0]!.topic).toBeNull();
});

test('a clear also needs two good samples, and one message says how long it was open', async () => {
  await sampleAt(world({ nonnix: 18_432 }), minute(0));
  await sampleAt(world({ nonnix: 18_432 }), minute(5));
  db.query("UPDATE outbox SET status = 'sent'").run(); // atc took it
  const n = outbox().length;
  await sampleAt(world(), minute(10));
  await sampleAt(world({ nonnix: 18_432 }), minute(15)); // breach again: the good count restarts
  await sampleAt(world(), minute(20));
  expect(outbox()).toHaveLength(n);
  await sampleAt(world(), minute(25));
  const sent = outbox().slice(n);
  expect(sent).toHaveLength(2);
  expect(sent[0]!.text).toContain('back under 16,384 MiB (open 20 min)');
  expect(sent[0]!.topic).toBeNull();
  expect(openAlerts(db)).toEqual({});
});

test('a sample with no reading neither opens nor clears, and keeps the count', async () => {
  await sampleAt(world({ nonnix: 18_432 }), minute(0));
  await sampleAt(world({ impzBroken: true }), minute(5)); // no reading
  expect(outbox()).toHaveLength(0);
  await sampleAt(world({ nonnix: 18_432 }), minute(10)); // second breach in a row, counting through the gap
  expect(Object.keys(openAlerts(db))).toEqual(['impd:nonnix']);
  db.query("UPDATE outbox SET status = 'sent'").run(); // atc took it
  const n = outbox().length;
  await sampleAt(world(), minute(15));
  await sampleAt(world({ impzBroken: true }), minute(20)); // no reading: still open
  expect(Object.keys(openAlerts(db))).toEqual(['impd:nonnix']);
  await sampleAt(world(), minute(25));
  expect(openAlerts(db)).toEqual({});
  expect(outbox().length).toBe(n + 2);
});

test('cloud and Claude thresholds open one alert each; several in a tick make one message', async () => {
  for (const m of [0, 5]) {
    usage(minute(m), 95, 90);
    await sampleAt(world({ cloudAvail: 3 }), minute(m));
  }
  expect(Object.keys(openAlerts(db)).sort()).toEqual(['claude:5h', 'claude:7d', 'cloud:memory']);
  const sent = outbox().filter((m) => m.target === owner());
  expect(sent).toHaveLength(1);
  expect(sent[0]!.text).toContain('3 things are over their line');
  expect(sent[0]?.text).toContain('- cloud: 3.0 GiB memory available, under 4 GiB (of 31.3 GiB)');
  expect(sent[0]!.text).toContain('- Claude: 7-day usage at 90%, at or over 85% (account abcdef)');
  expect(sent[0]!.text).toContain('- Claude: 5-hour usage at 95%, at or over 90%');
});

test('the PC never alerts, however low it is', async () => {
  const low: CapacityProbe = { ...probe(world()), run: async (cmd) => (cmd[0] === 'df' ? { code: 0, stdout: 'h\n/dev/x 100 99 1 99% /', stderr: '' } : probe(world()).run(cmd)), readFile: async () => 'MemAvailable: 10 kB' };
  for (const m of [0, 5, 10]) {
    at(minute(m).toISOString());
    await sampleCapacity(db, low, 'hq-lanes', minute(m));
  }
  expect(outbox()).toHaveLength(0);
  expect((await latestSample(db))!.pc_disk_free_bytes).toBe(1);
});

test('quiet hours: an impd open goes out at once; another alert waits for the first awake tick', async () => {
  const quiet = (m: number) => new Date(Date.parse(FOUR_AM_SYDNEY) + m * 60_000);
  for (const m of [0, 5]) await sampleAt(world({ nonnix: 20_000, cloudAvail: 2 }), quiet(m));
  const told = outbox().filter((m) => m.target === owner());
  expect(told).toHaveLength(1);
  expect(told[0]!.text).toContain('impd:');
  expect(told[0]?.text).not.toContain('cloud:');
  expect(Object.values(openAlerts(db)).map((o) => o.told)).toEqual([true, false]);
  db.query("UPDATE outbox SET status = 'sent'").run(); // atc answered
  // 07:00 Sydney is awake: the cloud alert, still open and never told, goes out once.
  const morning = new Date(Date.parse(FOUR_AM_SYDNEY) + 3 * 3_600_000);
  await sampleAt(world({ nonnix: 20_000, cloudAvail: 2 }), morning);
  const after = outbox().filter((m) => m.target === owner());
  expect(after).toHaveLength(2);
  expect(after[1]?.text).toContain('cloud:');
  expect(after[1]!.text).toContain('Still open:'); // the impd alert, already told
  await sampleAt(world({ nonnix: 20_000, cloudAvail: 2 }), new Date(morning.getTime() + 300_000));
  expect(outbox().filter((m) => m.target === owner())).toHaveLength(2); // nothing twice
});

test('quiet hours: an alert that opens and clears inside them sends nothing; a told one is cleared at wake', async () => {
  const quiet = (m: number) => new Date(Date.parse(FOUR_AM_SYDNEY) + m * 60_000);
  for (const m of [0, 5]) await sampleAt(world({ cloudAvail: 2 }), quiet(m));
  for (const m of [10, 15]) await sampleAt(world(), quiet(m));
  expect(openAlerts(db)).toEqual({});
  expect(outbox()).toHaveLength(0);

  for (const m of [20, 25]) await sampleAt(world({ nonnix: 20_000 }), quiet(m)); // urgent: told
  db.query("UPDATE outbox SET status = 'sent'").run(); // atc took it
  for (const m of [30, 35]) await sampleAt(world(), quiet(m)); // clear: held
  expect(outbox().filter((m) => m.target === owner())).toHaveLength(1);
  await sampleAt(world(), new Date(Date.parse(FOUR_AM_SYDNEY) + 3 * 3_600_000));
  const sent = outbox().filter((m) => m.target === owner());
  expect(sent).toHaveLength(2);
  expect(sent[1]!.text).toContain('back under 16,384 MiB');
});

test('awake totals count plugged memory, so elastic imps can trip the non-Nix alert', async () => {
  const r = await sampleAt(world({ nonnix: 12_288, plugged: 6144 }), minute(0));
  expect(r.reading.nonnix_awake_mib).toBe(18_432);
  await sampleAt(world({ nonnix: 12_288, plugged: 6144 }), minute(5));
  expect(Object.keys(openAlerts(db))).toEqual(['impd:nonnix']);
});

test('an atc outage loses no notice: every open and back-under stays queued, in order, for both recipients', async () => {
  for (const m of [0, 5]) await sampleAt(world({ nonnix: 20_000 }), minute(m)); // impd opens
  for (const m of [10, 15]) await sampleAt(world({ nonnix: 20_000, cloudAvail: 2 }), minute(m)); // cloud opens
  for (const m of [20, 25]) await sampleAt(world({ cloudAvail: 2 }), minute(m)); // impd clears
  for (const m of [30, 35]) await sampleAt(world({ nonnix: 20_000, cloudAvail: 2 }), minute(m)); // impd opens again
  for (const m of [40, 45]) await sampleAt(world(), minute(m)); // both clear on one tick
  for (const m of [50, 55]) await sampleAt(world({ cloudAvail: 2 }), minute(m)); // cloud opens again
  for (const m of [60, 65]) await sampleAt(world(), minute(m)); // cloud clears
  for (const t of [owner(), orchestratorName()]) {
    const texts = outbox().filter((m) => m.target === t).map((m) => m.text.split('\n')[1]!);
    expect(texts).toEqual([
      expect.stringContaining('impd:'),
      expect.stringContaining('cloud:'),
      expect.stringContaining('non-Nix imps awake back under'),
      expect.stringContaining('impd:'),
      expect.stringContaining('back under'),
      expect.stringContaining('cloud:'),
      expect.stringContaining('back under'),
    ]);
  }
  expect(outbox().every((m) => m.topic === null)).toBe(true);
});

test('an alert that reopens in quiet hours drops its old held recovery', async () => {
  const q = (m: number) => new Date(Date.parse(FOUR_AM_SYDNEY) + m * 60_000);
  for (const m of [0, 5]) await sampleAt(world({ nonnix: 20_000 }), q(m));
  db.query("UPDATE outbox SET status = 'sent'").run();
  for (const m of [10, 15]) await sampleAt(world(), q(m)); // clear held
  for (const m of [20, 25]) await sampleAt(world({ nonnix: 20_000 }), q(m)); // reopens
  const n = outbox().length;
  await sampleAt(world({ nonnix: 20_000 }), new Date(Date.parse(FOUR_AM_SYDNEY) + 3 * 3_600_000));
  expect(outbox().slice(n).some((m) => m.text.includes('back under'))).toBe(false);
});

test('settings: set, reset, bad key, bad value; each change is logged', () => {
  expect(capacitySettings(db).nonnixMaxMib).toBe(16384);
  expect(setCapacitySetting(db, 'nonnixMaxMib', '12000', 'z-stu').nonnixMaxMib).toBe(12000);
  expect(capacitySettings(db).nonnixMaxMib).toBe(12000);
  expect(setCapacitySetting(db, 'nonnixMaxMib', null, 'z-stu').nonnixMaxMib).toBe(16384);
  expect(() => setCapacitySetting(db, 'bogus', '1', 'z-stu')).toThrow('unknown setting');
  expect(() => setCapacitySetting(db, 'holdSamples', '-1', 'z-stu')).toThrow('0 or more');
  expect(() => setCapacitySetting(db, 'holdSamples', 'x', 'z-stu')).toThrow('0 or more');
  expect(db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'setting' AND subject_id = 'capacity'").get()).toEqual({ n: 2 });
});

test('holdSamples 1 opens on the first breach', async () => {
  setCapacitySetting(db, 'holdSamples', '1', 'z-stu');
  await sampleAt(world({ nonnix: 20_000 }), minute(0));
  expect(Object.keys(openAlerts(db))).toEqual(['impd:nonnix']);
});

test('samples older than 30 days are pruned on each sample; the log reads newest first', async () => {
  await sampleAt(world(), new Date(Date.parse(NOON_SYDNEY) - 31 * 86_400_000));
  await sampleAt(world(), new Date(Date.parse(NOON_SYDNEY) - 29 * 86_400_000));
  expect(db.query('SELECT COUNT(*) AS n FROM capacity_samples').get()).toEqual({ n: 2 });
  await sampleAt(world(), minute(0));
  expect(db.query('SELECT COUNT(*) AS n FROM capacity_samples').get()).toEqual({ n: 2 }); // the 31-day-old one went
  await sampleAt(world(), minute(60));
  const log = await sampleLog(db, 24, minute(60));
  expect(log.map((r) => r.at)).toEqual([minute(60), minute(0)].map((d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')));
});

test('the daily line: from a recent sample, each part, and no reading when null; none when stale', async () => {
  expect(loadCapacityLine(db, minute(0))).toBe('Capacity: no recent reading');
  usage(minute(-1), 40, 62);
  await sampleAt(world({ nonnix: 14_336, used: 10_858, cloudAvail: 14.5 }), minute(0));
  expect(loadCapacityLine(db, minute(10))).toBe('Capacity: impd non-Nix 14,336/16,384 MiB awake (used 10,858/20,480); cloud 14.5 GiB free; Claude 5h 40%, 7d 62%; CI today 0 min; PC 120 GiB disk, 9.1 GiB memory free');
  expect(loadCapacityLine(db, minute(16))).toBe('Capacity: no recent reading');
  await sampleAt(world({ impzBroken: true, cloudBroken: true }), minute(30));
  expect(loadCapacityLine(db, minute(31))).toContain('impd no reading; cloud no reading;');
});

test('the daily check-in carries the capacity line before Incidents today', async () => {
  const lines = dailyText(db, minute(0)).split('\n');
  expect(lines.at(-2)).toBe('Capacity: no recent reading');
  expect(lines.at(-1)).toStartWith('Incidents today');
  await sampleAt(world(), minute(0));
  const l = dailyText(db, minute(1)).split('\n');
  expect(l.at(-2)).toStartWith('Capacity: impd non-Nix 8,192/16,384 MiB awake');
  expect(l.at(-2)!.length).toBeLessThanOrEqual(159); // the check-in's line cap
});

// A probe whose impz lists these imps, with a budget beside them.
function buildImpzProbe(imps: readonly Record<string, unknown>[]): CapacityProbe {
  return {
    run: (cmd) => Promise.resolve({ code: 0, stdout: cmd[1] === 'info' ? JSON.stringify({ ramBudgetMib: 20_480, ramUsedMib: 4096, ramCommittedMib: 6144 }) : JSON.stringify(imps), stderr: '' }),
    readText: () => Promise.resolve(''),
    readFile: () => Promise.resolve(''),
  };
}
