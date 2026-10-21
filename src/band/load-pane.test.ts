import { expect, onTestFinished, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { loadPane } from './load-pane.ts';

const AT = new Date('2026-10-15T01:00:00Z'),
  CONSOLE = 'http://127.0.0.1:4317/';

// A database and the pacing.json hq reads; nothing is stored or written yet.
function setupTest() {
  const fresh = freshDb(),
    spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  // hq finds pacing.json beside capacity.sh's folder, so hq run lane reads the test's own.
  onTestFinished(overrideEnv('HQ_CAPACITY', join(fresh.dir, 'scripts', 'capacity.sh')));
  return { db: fresh.db, pacing: join(fresh.dir, 'pacing.json') };
}

// A 3-slot cleanup lane and a 1-slot flexible lane, one working run in cleanup, and an outage of
// 10 minutes this Sydney morning that has ended.
async function writeFleet(app: ReturnType<typeof setupTest>): Promise<Database> {
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  const added = await main(['run', 'add', 'GEO-9601', '--title', 'Fit the long spout', '--where', 'imp', '--json']),
    laned = await main(['run', 'lane', 'GEO-9601', 'cleanup', '--json']);
  expect([added, laned]).toStrictEqual([0, 0]);
  return app.db;
}

// One PR in review since 11:30 Sydney, one reviewed, and two merged this Sydney day for one issue
// in two repos.
function writePRs(db: Database): Database {
  const pr = db.query("INSERT INTO run_prs (ref, issue, url, state, review_started_at, reviewed_at, merged_at, added_at, updated_at) VALUES (?, 'GEO-9601', ?, ?, ?, ?, ?, '2026-10-14T00:00:00Z', '2026-10-15T00:00:00Z')");
  pr.run('kettle#41', null, 'open', '2026-10-15T00:30:00Z', null, null);
  pr.run('kettle#42', 'https://github.com/zgeoff/kettle/pull/42', 'open', '2026-10-15T00:10:00Z', '2026-10-15T00:20:00Z', null);
  pr.run('kettle#43', null, 'merged', null, null, '2026-10-14T22:00:00Z');
  pr.run('teapot#7', null, 'merged', null, null, '2026-10-14T23:00:00Z');
  return db;
}

// No session is awake at AT, so blocked GEO-9602 shows parked and holds no slot; a probe sample
// 2 minutes old keeps Nix up.
test('the pane lists what needs the owner with its links, then Nix, lanes, reviews, shipped today and news, as Markdown', async () => {
  const app = setupTest(),
    fleet = await writeFleet(app),
    news = await main(['news', 'add', '--topic', 'merge', '--text', 'kettle#43 merged: the long spout fits', '--json']),
    parkAdd = await main(['run', 'add', 'GEO-9602', '--title', 'Seal the teapot lid', '--where', 'imp', '--json']),
    parkLane = await main(['run', 'lane', 'GEO-9602', 'cleanup', '--json']),
    parkState = await main(['run', 'state', 'GEO-9602', 'blocked', '--waits-on', 'the teapot supplier', '--json']),
    pending = writePRs(createUnblockItems(fleet, { lid: { task: 'Fit the new lid on the kettle', links: [{ label: 'kettle#41', url: 'https://github.com/zgeoff/kettle/pull/41', subject: true }] } })),
    reading = pending.query("INSERT OR REPLACE INTO meta (key, value) VALUES ('atc_awake', ?)").run(JSON.stringify({ at: '2026-10-15T01:00:00.000Z', ids: [] })),
    sample = pending.query("INSERT INTO probe_samples (at, target_ok, control_ok) VALUES ('2026-10-15T00:58:00Z', 1, 1)").run(),
    shown = await loadPane(pending, app.pacing, CONSOLE, AT);
  expect([news, parkAdd, parkLane, parkState, reading.changes, sample.changes, shown.heat]).toStrictEqual([
    0,
    0,
    0,
    0,
    1,
    1,
    [
      { lane: 'cleanup', size: 3, used: 1 },
      { lane: 'flexible', size: 1, used: 0 },
    ],
  ]);
  expect(shown.markdown.split('\n\n')).toStrictEqual([
    '## Needs you (1)\n- review: Fit the new lid on the kettle · [kettle#41](https://github.com/zgeoff/kettle/pull/41)\n[Open the console](http://127.0.0.1:4317/)',
    '## Nix\nUp · 0 min down today',
    '## Lanes\n- cleanup 1/3: GEO-9601, GEO-9602 (parked)\n- flexible 0/1',
    '## Reviews in flight (1)\n- [kettle#41](https://github.com/zgeoff/kettle/pull/41): round 1, started 11:30',
    '## Shipped today\n2 PRs in 2 repos, for 1 issue · [Shipped tab](http://127.0.0.1:4317/shipped)',
    '## News\n- kettle#43 merged: the long spout fits',
  ]);
});

test('a lane holding more runs than its size shows the true count in bold, as the band does', async () => {
  const app = setupTest(),
    fleet = await writeFleet(app),
    laned = [
      await main(['run', 'add', 'GEO-9701', '--title', 'Fit the long spout', '--where', 'local', '--json']),
      await main(['run', 'lane', 'GEO-9701', 'flexible', '--json']),
      await main(['run', 'add', 'GEO-9702', '--title', 'Seal the teapot lid', '--where', 'local', '--json']),
      await main(['run', 'lane', 'GEO-9702', 'flexible', '--json']),
    ],
    shown = await loadPane(fleet, app.pacing, CONSOLE, AT);
  expect([laned, shown.markdown.split('\n\n')[2], shown.heat]).toStrictEqual([
    [0, 0, 0, 0],
    '## Lanes\n- cleanup 1/3: GEO-9601\n- flexible **2/1**: GEO-9701, GEO-9702',
    [
      { lane: 'cleanup', size: 3, used: 1 },
      { lane: 'flexible', size: 1, used: 2 },
    ],
  ]);
});

test('imp lanes whose sizes, all full, cross impd\'s line put a bold warning first under Lanes', async () => {
  const app = setupTest();
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 3072 }, lanes: { imp: { cleanup: 5, nixie: 1 }, local: { flexible: 1 } } }));

  await expect(loadPane(app.db, app.pacing, CONSOLE, AT).then((pane) => pane.markdown.split('\n\n')[2])).resolves.toBe("## Lanes\n**The imp lanes, all full, cross impd's line: plan 18/16 GiB**\n- cleanup 0/5\n- nixie 0/1\n- flexible 0/1");
});

test('a title the console cuts inside a URL is cut before the URL, so the pane links no broken address', async () => {
  const app = setupTest(),
    base = createUnblockItems(app.db, {
      gate: { task: 'Sign in to the kettle gateway once with your passkey (open https://kettle.example.invalid/login/passkey)' },
      lid: { task: 'Fit the new lid on the kettle' },
    }),
    shown = await loadPane(base, app.pacing, CONSOLE, AT);
  expect(shown.markdown.split('\n\n')[0]).toBe('## Needs you (2)\n- todo: Sign in to the kettle gateway once with your passkey (open…\n- todo: Fit the new lid on the kettle\n[Open the console](http://127.0.0.1:4317/)');
});

test('with no probe sample in 5 minutes, or a blind newest sample, Nix is unknown and says why', async () => {
  const app = setupTest(),
    olderSample = writeProbeSample(writeOpenOutage(app), '2026-10-15T00:50:00Z', 1),
    olderShown = await loadPane(olderSample, app.pacing, CONSOLE, AT),
    recentBlind = writeProbeSample(olderSample, '2026-10-15T00:59:00Z', 0),
    recentShown = await loadPane(recentBlind, app.pacing, CONSOLE, AT);
  expect([olderShown.markdown.split('\n\n')[1], recentShown.markdown.split('\n\n')[1]]).toStrictEqual([
    '## Nix\n**Unknown**: no probe sample in 5 min · 0 min down today',
    '## Nix\n**Unknown**: the newest probe was blind · 0 min down today',
  ]);
});

test('an open outage shows Nix down since it started, and an empty fleet says so in each section', async () => {
  const app = setupTest(),
    base = writeOpenOutage(app),
    shown = await loadPane(base, app.pacing, CONSOLE, AT);
  expect(shown.markdown.split('\n\n')).toStrictEqual([
    '## Needs you (0)\nNothing waits on you.\n[Open the console](http://127.0.0.1:4317/)',
    '## Nix\n**Down** since 11:50 · 0 min down today',
    '## Lanes\nNo lanes in pacing.json.',
    '## Reviews in flight (0)\nNone.',
    '## Shipped today\n0 PRs in 0 repos, for 0 issues · [Shipped tab](http://127.0.0.1:4317/shipped)',
    '## News\nNo news yet.',
  ]);
});

test('a pacing.json hq refuses says why under Lanes, and draws no heat map', async () => {
  const app = setupTest(),
    base = writeRefusedPacing(app),
    shown = await loadPane(base, app.pacing, CONSOLE, AT);
  expect([shown.heat, shown.markdown.split('\n\n')[2]]).toStrictEqual([[], "## Lanes\nhq can't read the lanes: pacing.json: pacing.json lends: bad entry teapot"]);
});

// Closes every outage and adds one probe sample whose target and control both gave `ok`.
function writeProbeSample(db: Database, at: string, ok: number): Database {
  db.query('DELETE FROM outages').run();
  db.query('INSERT INTO probe_samples (at, target_ok, control_ok) VALUES (?, ?, ?)').run(at, ok, ok);
  return db;
}

// An outage that opened at 11:50 Sydney and is still open, no probe samples, and no lanes.
function writeOpenOutage(app: ReturnType<typeof setupTest>): Database {
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 2048 } }));
  app.db.query("INSERT INTO outages (started_at, detected_at, kind) VALUES (?, ?, 'down')").run('2026-10-15T00:50:00Z', '2026-10-15T00:53:00Z');
  return app.db;
}

function writeRefusedPacing(app: ReturnType<typeof setupTest>): Database {
  writeFileSync(app.pacing, JSON.stringify({ lanes: { imp: { cleanup: 3 }, local: {} }, lends: { teapot: false } }));
  return app.db;
}
