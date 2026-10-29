import { expect, onTestFinished, test } from 'bun:test';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { setState } from './set-state.ts';
import { sweepNow } from './sweep-now.ts';

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const server = fakeAtc(fresh.dir, []);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());

  return { db: fresh.db, client };
}

test('it flags nothing for a final PR that GitHub shows closed unmerged, and marks it closed', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9851', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9851', 'kettle#51', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#51'").run();
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#51': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } });

  const swept = await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')) } });

  expect(swept).toStrictEqual({ alerts: [], sent: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#51'").get()).toStrictEqual({ state: 'closed' });
});

test('it still sweeps for alerts when the wrap-up of merged runs throws', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));

  // An issue that is not a Linear key makes the news item of the kept session throw.
  addRun(ctx.db, { issue: 'kettle-52', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'kettle-52', 'kettle#52', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'kettle-52', 'merged', {}, 'kettle-bot');
  addRun(ctx.db, { issue: 'GEO-9853', title: 'Invented teapot work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9853', 'kettle#53', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#53'").run();
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#53': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } });
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, pinned: true }] });

  const swept = await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('no check expected')) } });

  expect(swept).toStrictEqual({ alerts: [], sent: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#53'").get()).toStrictEqual({ state: 'closed' });
});
