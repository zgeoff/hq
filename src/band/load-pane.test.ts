import { expect, onTestFinished, spyOn, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { freshDb, at as setNow } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { reviewStarted } from '../runs/review-started.ts';
import { writeReviewed } from '../runs/write-reviewed.ts';
import { loadPane } from './load-pane.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  const spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  // hq finds pacing.json beside capacity.sh's folder, so hq run lane reads the test's own.
  onTestFinished(overrideEnv('HQ_CAPACITY', join(fresh.dir, 'scripts', 'capacity.sh')));
  return { db: fresh.db, seed: buildSeeder(fresh), pacing: join(fresh.dir, 'pacing.json'), consoleURL: 'http://127.0.0.1:4317/', at: new Date('2026-10-15T01:00:00Z') };
}

async function writeFleet(app: ReturnType<typeof setupTest>): Promise<Database> {
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  const added = await main(['run', 'add', 'GEO-9601', '--title', 'Fit the long spout', '--where', 'imp', '--session', 'a0000601-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '--json']);
  const laned = await main(['run', 'lane', 'GEO-9601', 'cleanup', '--json']);
  expect([added, laned]).toStrictEqual([0, 0]);
  return app.db;
}

test('the pane lists what needs the owner with its links, then Nix, lanes, reviews, shipped today and news, as Markdown', async () => {
  const app = setupTest();
  const fleet = await writeFleet(app);
  const news = await main(['news', 'add', '--topic', 'merge', '--text', 'kettle#43 merged: the long spout fits', '--json']);
  const parkAdd = await main(['run', 'add', 'GEO-9602', '--title', 'Seal the teapot lid', '--where', 'imp', '--json']);
  const parkLane = await main(['run', 'lane', 'GEO-9602', 'cleanup', '--json']);
  const parkState = await main(['run', 'state', 'GEO-9602', 'blocked', '--waits-on', 'the teapot supplier', '--json']);
  setNow('2026-10-14T00:00:00Z');
  app.seed.runPR({ issue: 'GEO-9601', ref: 'kettle#41' });
  app.seed.runPR({ issue: 'GEO-9601', ref: 'https://github.com/zgeoff/kettle/pull/42' });
  app.seed.mergedRunPR({ issue: 'GEO-9601', ref: 'kettle#43', mergedAt: '2026-10-14T22:00:00Z' });
  app.seed.mergedRunPR({ issue: 'GEO-9601', ref: 'teapot#7', mergedAt: '2026-10-14T23:00:00Z' });
  setNow('2026-10-15T00:10:00Z');
  reviewStarted(fleet, 'kettle#42', 'kettle-bot');
  setNow('2026-10-15T00:20:00Z');
  writeReviewed(fleet, 'kettle', 42, { head: buildMockSha(42), countsRound: false });
  setNow('2026-10-15T00:30:00Z');
  reviewStarted(fleet, 'kettle#41', 'kettle-bot');
  setNow('2026-10-15T01:00:00Z');
  const pending = createUnblockItems(fleet, { lid: { task: 'Fit the new lid on the kettle', links: [{ label: 'kettle#41', url: 'https://github.com/zgeoff/kettle/pull/41', subject: true }] } });
  app.seed.meta({ key: 'atc_awake', value: JSON.stringify({ at: '2026-10-15T01:00:00.000Z', ids: ['a0000601-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }) });
  app.seed.probeSample({ at: '2026-10-15T00:58:00Z' });
  const shown = await loadPane(pending, app.pacing, app.consoleURL, app.at);
  expect([news, parkAdd, parkLane, parkState, shown.heat]).toStrictEqual([
    0,
    0,
    0,
    0,
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
  const app = setupTest();
  const fleet = await writeFleet(app);
  const laned = [
    await main(['run', 'add', 'GEO-9701', '--title', 'Fit the long spout', '--where', 'local', '--json']),
    await main(['run', 'lane', 'GEO-9701', 'flexible', '--json']),
    await main(['run', 'add', 'GEO-9702', '--title', 'Seal the teapot lid', '--where', 'local', '--json']),
    await main(['run', 'lane', 'GEO-9702', 'flexible', '--json']),
  ];
  const shown = await loadPane(fleet, app.pacing, app.consoleURL, app.at);
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

  await expect(loadPane(app.db, app.pacing, app.consoleURL, app.at).then((pane) => pane.markdown.split('\n\n')[2])).resolves.toBe("## Lanes\n**The imp lanes, all full, cross impd's line: plan 18/16 GiB**\n- cleanup 0/5\n- nixie 0/1\n- flexible 0/1");
});

test('a title the console cuts inside a URL is cut before the URL, so the pane links no broken address', async () => {
  const app = setupTest();
  const base = createUnblockItems(app.db, {
    gate: { task: 'Sign in to the kettle gateway once with your passkey (open https://kettle.example.invalid/login/passkey)' },
    lid: { task: 'Fit the new lid on the kettle' },
  });
  const shown = await loadPane(base, app.pacing, app.consoleURL, app.at);
  expect(shown.markdown.split('\n\n')[0]).toBe('## Needs you (2)\n- todo: Sign in to the kettle gateway once with your passkey (open…\n- todo: Fit the new lid on the kettle\n[Open the console](http://127.0.0.1:4317/)');
});

test('with no probe sample in 5 minutes, or a blind newest sample, Nix is unknown and says why', async () => {
  const app = setupTest();
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 2048 } }));
  app.seed.probeSample({ at: '2026-10-15T00:50:00Z' });
  const olderShown = await loadPane(app.db, app.pacing, app.consoleURL, app.at);
  app.seed.blindProbeSample({ at: '2026-10-15T00:59:00Z' });
  const recentShown = await loadPane(app.db, app.pacing, app.consoleURL, app.at);
  expect([olderShown.markdown.split('\n\n')[1], recentShown.markdown.split('\n\n')[1]]).toStrictEqual([
    '## Nix\n**Unknown**: no probe sample in 5 min · 0 min down today',
    '## Nix\n**Unknown**: the newest probe was blind · 0 min down today',
  ]);
});

test('an open outage shows Nix down since it started, and an empty fleet says so in each section', async () => {
  const app = setupTest();
  writeFileSync(app.pacing, JSON.stringify({ imp: { impMib: 2048 } }));
  app.seed.outage({ startedAt: '2026-10-15T00:50:00Z', detectedAt: '2026-10-15T00:53:00Z' });
  const shown = await loadPane(app.db, app.pacing, app.consoleURL, app.at);
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
  const app = setupTest();
  writeFileSync(app.pacing, JSON.stringify({ lanes: { imp: { 'Bad Teapot': 3 }, local: {} } }));
  const shown = await loadPane(app.db, app.pacing, app.consoleURL, app.at);
  expect([shown.heat, shown.markdown.split('\n\n')[2]]).toStrictEqual([[], "## Lanes\nhq can't read the lanes: pacing.json: pacing.json lanes: bad lane imp.Bad Teapot"]);
});
