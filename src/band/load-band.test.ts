import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUnblockItems } from '../../test/create-unblock-items.ts';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { closePr } from '../runs/close-pr.ts';
import { reviewStarted } from '../runs/review-started.ts';
import { writeReviewed } from '../runs/write-reviewed.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { main } from '../cli.ts';
import { setMeta } from '../db/set-meta.ts';
import { overrideEnv } from '../config/override-env.ts';
import { loadBand } from './load-band.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  const spy = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(fresh.cleanup);
  onTestFinished(() => spy.mockRestore());
  onTestFinished(overrideEnv('HQ_AS', 'kettle-bot'));

  // hq finds pacing.json beside capacity.sh's folder, so hq run lane reads the test's own.
  onTestFinished(overrideEnv('HQ_CAPACITY', join(fresh.dir, 'scripts', 'capacity.sh')));
  return { db: fresh.db, seed: buildSeeder(fresh), pacing: join(fresh.dir, 'pacing.json') };
}

test('all clear: nothing needs the owner, Nix is up, impd has room, CI passed, and each segment is plain', async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  ctx.seed.probeSample({ at: '2026-10-15T00:59:00Z' });
  await ctx.seed.capacitySample({ at: '2026-10-15T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });
  ctx.seed.ciRun({ id: 1, repo: 'kettle', created_at: '2026-10-15T00:00:00Z', started_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:05:00Z' });
  await main(['run', 'add', 'GEO-9601', '--title', 'Fit the long spout', '--where', 'imp', '--json']);
  await main(['run', 'lane', 'GEO-9601', 'cleanup', '--json']);

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => [band.line, band.segments.map((segment) => segment.tone)])).resolves.toStrictEqual([
    'Needs you 0 · Nix up · lanes 1/4 (impd 8/16 GiB, 6/16 vCPU) · CI green · reviews 0',
    ['ok', 'ok', 'ok', 'ok', 'ok'],
  ]);
});

test('a cap turns the lanes segment into working over the cap, with the pool size, until and impd text', async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 2, until: '2026-10-18T21:00:00Z', reason: 'weekend pacing', by: 'z-stu', at: '2026-10-15T00:00:00Z' }));
  await main(['run', 'add', 'GEO-9601', '--title', 'Fit the long spout', '--where', 'imp', '--json']);

  const band = await loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z'));

  expect(band.segments[2]).toStrictEqual({ key: 'lanes', text: 'lanes 1/2 (cap of 4 until Mon 08:00; impd 8/16 GiB, 6/16 vCPU)', tone: 'ok' });
});

test('a cap with no until leaves the until out of the lanes segment', async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });
  setMeta(ctx.db, 'lanes_cap', JSON.stringify({ cap: 3, until: null, reason: null, by: 'z-stu', at: '2026-10-15T00:00:00Z' }));

  const band = await loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z'));

  expect(band.segments[2]?.text).toBe('lanes 0/3 (cap of 4; impd 8/16 GiB, 6/16 vCPU)');
});

test('something waiting on the owner turns Needs you red', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { lid: { task: 'Fit the new lid on the kettle' } });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[0])).resolves.toStrictEqual({ key: 'needs', text: 'Needs you 1', tone: 'alert' });
});

test.each([
  ['with a fresh probe sample', '2026-10-15T01:00:00Z'],
  ['once the probe falls silent', '2026-10-15T01:05:00Z'],
])('it shows an open outage as Nix down in red %s', async (_case, lookedAt) => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: '2026-10-15T00:59:00Z' });
  ctx.seed.outage({ startedAt: '2026-10-15T00:50:00Z', detectedAt: '2026-10-15T00:53:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date(lookedAt)).then((band) => band.segments[1])).resolves.toStrictEqual({ key: 'nix', text: 'Nix down', tone: 'alert' });
});

test('a probe silent over 5 minutes with no outage open is Nix unknown in amber', async () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: '2026-10-15T00:59:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:05:00Z')).then((band) => band.segments[1])).resolves.toStrictEqual({ key: 'nix', text: 'Nix ?', tone: 'warn' });
});

test('a fresh probe sample that was blind, the target and the control both failing, is Nix unknown in amber', async () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: '2026-10-15T00:59:00Z' });
  ctx.seed.blindProbeSample({ at: '2026-10-15T00:59:30Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[1])).resolves.toStrictEqual({ key: 'nix', text: 'Nix ?', tone: 'warn' });
});

test('reviews counts open PRs whose review started in the last 24 hours and has not finished', async () => {
  const ctx = setupTest();
  at('2026-10-13T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9601', title: 'Fit the long spout', place: 'imp' });
  for (const ref of ['kettle#41', 'kettle#42', 'kettle#43', 'kettle#44']) {
    ctx.seed.runPr({ issue: 'GEO-9601', ref });
  }
  at('2026-10-13T00:30:00Z');
  reviewStarted(ctx.db, 'kettle#44', 'kettle-bot');
  at('2026-10-15T00:10:00Z');
  reviewStarted(ctx.db, 'kettle#42', 'kettle-bot');
  at('2026-10-15T00:20:00Z');
  writeReviewed(ctx.db, 'kettle', 42, { head: buildMockSha(42), countsRound: false });
  at('2026-10-15T00:30:00Z');
  reviewStarted(ctx.db, 'kettle#41', 'kettle-bot');
  reviewStarted(ctx.db, 'kettle#43', 'kettle-bot');
  closePr(ctx.db, 'kettle#43', { to: 'closed', actor: 'kettle-bot' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[4])).resolves.toStrictEqual({ key: 'reviews', text: 'reviews 1', tone: 'ok' });
});

test.each([
  ['memory', 15_000, 6, 'impd 15/16 GiB, 6/16 vCPU'],
  ['vCPUs', 8192, 15, 'impd 8/16 GiB, 15/16 vCPU'],
])('one imp from the %s line turns lanes amber', async (_line, mib, vcpus, text) => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:58:00Z', nonnix_awake_mib: mib, nonnix_awake_vcpus: vcpus });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[2])).resolves.toStrictEqual({ key: 'lanes', text: `lanes 0/4 (${text})`, tone: 'warn' });
});

test.each([
  ['memory', 3072, 1, 'lanes 0/7 (impd 8/16 GiB, 6/16 vCPU; plan 18/16 GiB)'],
  ['vCPU', 1024, 4, 'lanes 0/10 (impd 8/16 GiB, 6/16 vCPU; plan 18/16 vCPU)'],
])('imp lanes whose sizes, all full, cross impd\'s %s line turn lanes amber and say which', async (_line, impMib, nixie, text) => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib }, lanes: { imp: { cleanup: 5, nixie }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[2])).resolves.toStrictEqual({ key: 'lanes', text, tone: 'warn' });
});

test('an impd reading over 15 minutes old shows impd unknown and turns lanes amber', async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:44:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[2])).resolves.toStrictEqual({ key: 'lanes', text: 'lanes 0/4 (impd ?)', tone: 'warn' });
});

test.each([
  { title: 'imp runs within the imp cap show in plain', place: 'imp', count: 3, text: 'lanes 3/4 (impd 8/16 GiB, 6/16 vCPU)', tone: 'ok' },
  { title: 'imp runs over the imp cap show in amber though the total fits', place: 'imp', count: 4, text: 'lanes 4/4 (impd 8/16 GiB, 6/16 vCPU)', tone: 'warn' },
  { title: 'local runs over the local cap show in amber though the total fits', place: 'local', count: 3, text: 'lanes 3/4 (impd 8/16 GiB, 6/16 vCPU)', tone: 'warn' },
  { title: 'runs over both caps together show the real number in amber', place: 'imp', count: 5, text: 'lanes 5/4 (impd 8/16 GiB, 6/16 vCPU)', tone: 'warn' },
] as const)('$title', async (row) => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { cleanup: 3 }, local: { flexible: 1 } } }));
  await ctx.seed.capacitySample({ at: '2026-10-15T00:55:00Z', nonnix_awake_mib: 8192, nonnix_awake_vcpus: 6 });
  at('2026-10-15T00:00:00Z');
  for (let index = 1; index <= row.count; index++) {
    ctx.seed.run({ issue: `GEO-970${index}`, title: 'Fit the long spout', place: row.place, lane: 'cleanup' });
  }

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[2])).resolves.toStrictEqual({ key: 'lanes', text: row.text, tone: row.tone });
});

test('a failed push run after a passing one is CI red', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 1, repo: 'kettle', created_at: '2026-10-15T00:00:00Z', started_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:05:00Z' });
  ctx.seed.ciRun({ id: 2, repo: 'kettle', conclusion: 'failure', created_at: '2026-10-15T00:30:00Z', started_at: '2026-10-15T00:30:00Z', updated_at: '2026-10-15T00:35:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[3])).resolves.toStrictEqual({ key: 'ci', text: 'CI 1 red', tone: 'alert' });
});

test('a later passing run of the same workflow clears a failure', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 2, repo: 'kettle', conclusion: 'failure', created_at: '2026-10-15T00:30:00Z', started_at: '2026-10-15T00:30:00Z', updated_at: '2026-10-15T00:35:00Z' });
  ctx.seed.ciRun({ id: 3, repo: 'kettle', created_at: '2026-10-15T00:40:00Z', started_at: '2026-10-15T00:40:00Z', updated_at: '2026-10-15T00:45:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[3])).resolves.toStrictEqual({ key: 'ci', text: 'CI green', tone: 'ok' });
});

test.each([
  ['a failed pull-request run leaves CI green', 'success', { path: '.github/workflows/ci.yml', event: 'pull_request', status: 'completed', conclusion: 'failure' }, { key: 'ci', text: 'CI green', tone: 'ok' }],
  ['an unfinished push run does not clear an earlier failure', 'failure', { path: '.github/workflows/ci.yml', event: 'push', status: 'in_progress', conclusion: null }, { key: 'ci', text: 'CI 1 red', tone: 'alert' }],
  ['a passing run of another workflow does not clear a failure', 'failure', { path: '.github/workflows/deploy.yml', event: 'push', status: 'completed', conclusion: 'success' }, { key: 'ci', text: 'CI 1 red', tone: 'alert' }],
] as const)('%s', async (_case, earlier, later, segment) => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 2, repo: 'kettle', conclusion: earlier, created_at: '2026-10-15T00:10:00Z', started_at: '2026-10-15T00:10:00Z', updated_at: '2026-10-15T00:15:00Z' });
  ctx.seed.ciRun({ id: 4, repo: 'kettle', ...later, created_at: '2026-10-15T00:20:00Z', started_at: '2026-10-15T00:20:00Z', updated_at: '2026-10-15T00:25:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[3])).resolves.toStrictEqual(segment);
});

test('CI stored over 2 hours ago is unknown in amber', async () => {
  const ctx = setupTest();
  ctx.seed.ciRun({ id: 1, repo: 'kettle', created_at: '2026-10-15T00:00:00Z', started_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:05:00Z' });

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T03:00:00Z')).then((band) => band.segments[3])).resolves.toStrictEqual({ key: 'ci', text: 'CI ?', tone: 'warn' });
});

test('a pacing.json hq cannot read shows lanes unknown, not a failure', async () => {
  const ctx = setupTest();
  writeFileSync(ctx.pacing, JSON.stringify({ lanes: { imp: { 'Bad Teapot': 3 }, local: {} } }));

  await expect(loadBand(ctx.db, ctx.pacing, new Date('2026-10-15T01:00:00Z')).then((band) => band.segments[2])).resolves.toStrictEqual({ key: 'lanes', text: 'lanes ?', tone: 'warn' });
});
