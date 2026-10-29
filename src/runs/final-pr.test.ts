import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import type { StubFinalFacts } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { finalPr } from './final-pr.ts';
import { findAlerts } from './find-alerts.ts';
import { listRuns } from './list-runs.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { resolveCliFinal } from './resolve-cli-final.ts';
import { reviewedPr } from './reviewed-pr.ts';

// A run with one PR, kettle#714, whose commits are an early one and a head, and a gh that knows them.
function setupTest(facts: StubFinalFacts = {}) {
  const fresh = freshDb();
  const early = `1a2b3c4${buildMockSha(1).slice(7)}`;
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const calls: string[] = [];
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [early, head], ...facts }, calls));
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const finalSha = () => listRuns(fresh.db)[0]?.prs[0]?.final_sha;
  const eventData = () => z.array(z.object({ data: z.string() })).parse(fresh.db.query(`SELECT data FROM events WHERE action = 'final'`).all()).map((event) => z.record(z.string(), z.unknown()).parse(JSON.parse(event.data)));
  const final = async (sha: string) => {
    const resolution = await resolveCliFinal(resolveFinal, 'kettle#714', sha);
    return finalPr(fresh.db, 'kettle#714', { sha, actor: 'z-q', resolution });
  };
  return { db: fresh.db, early, head, calls, finalSha, eventData, final };
}

test('it refuses a sha that is no commit of the PR, naming the sha and the head', async () => {
  const ctx = setupTest();

  await expect(ctx.final('4423866e')).rejects.toThrow('the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha');
  expect(ctx.finalSha()).toBeNull();
});

test('it stores a short sha as its full sha and the event keeps both', async () => {
  const ctx = setupTest();

  await ctx.final('44238662');

  expect([ctx.finalSha(), ctx.eventData()]).toMatchObject([ctx.head, [{ sha: ctx.head, given: '44238662', resolved: true }]]);
  expect(ctx.db.query(`SELECT text FROM outbox WHERE target = 'z-review'`).all()).toStrictEqual([{ text: 'Final: GEO-9731 (kettle#714 at 4423866). Review it, then merge.' }]);
});

test('it records the sha of an earlier commit of the PR, so the head shows as moved after a review there', async () => {
  const ctx = setupTest();

  await ctx.final('1a2b3c4');
  reviewedPr(ctx.db, 'kettle#714', ctx.head, { recheck: false, force: false }, 'z-delivery');
  const alerts = findAlerts(ctx.db, [], new Map(), new Date(Date.parse(NOON_SYDNEY) + 600 * 60_000));

  expect([ctx.finalSha(), alerts[0]?.line]).toMatchObject([ctx.early, expect.stringContaining('head moved since your review')]);
});

test('it records the full sha of a commit no longer in the PR that the commit lookup finds', async () => {
  const pushedAway = `ab12cd3${buildMockSha(3).slice(7)}`;
  const ctx = setupTest({ lookups: { ab12cd3: pushedAway } });

  await ctx.final('ab12cd3');

  expect(ctx.finalSha()).toBe(pushedAway);
});

test('it refuses a prefix of two commits and lists both full shas', async () => {
  const twin = `44238662${buildMockSha(4).slice(8)}`;
  const ctx = setupTest({ commits: [`44238662${buildMockSha(2).slice(8)}`, twin] });

  await expect(ctx.final('44238662')).rejects.toThrow(`which matches 2 commits of zgeoff/kettle#714: ${ctx.head}, ${twin} - this sha is ambiguous`);
});

test('it records the sha as given and says it was not resolved when GitHub fails', async () => {
  const ctx = setupTest({ commits: 'fault' });

  await ctx.final('4423866e');

  expect([ctx.finalSha(), ctx.eventData()]).toMatchObject([
    '4423866e',
    [{ sha: '4423866e', given: '4423866e', resolved: false, reason: 'gh: Bad Gateway (HTTP 502)' }],
  ]);
});

test('it records the sha as given when only the commit lookup fails', async () => {
  const ctx = setupTest({ lookupFault: true });

  await ctx.final('4423866e');

  expect(ctx.eventData()).toMatchObject([{ resolved: false }]);
});

test('it reads GitHub once for a sha that is no hex sha and refuses it on its own', async () => {
  const ctx = setupTest();

  await expect(ctx.final('nope')).rejects.toThrow('--sha must be a hex commit sha');
  expect(ctx.calls).toStrictEqual([]);
});
