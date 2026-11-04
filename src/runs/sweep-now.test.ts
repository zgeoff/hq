import { expect, mock, onTestFinished, test } from 'bun:test';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { finalPr } from './final-pr.ts';
import { setState } from './set-state.ts';
import { sweepNow } from './sweep-now.ts';

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const roster: { id: string; name: string; alive: boolean; state: string }[] = [];
  const server = fakeAtc(fresh.dir, roster);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());

  return { db: fresh.db, client, fake: { sessions: roster, activity: server.activity } };
}

test('it flags nothing for a final PR that GitHub shows closed unmerged, and marks it closed', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9851', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9851', 'kettle#51', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#51'").run();
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#51': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } });

  const swept = await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.reject(new Error('no wrap-up expected')), readImpWork: () => Promise.reject(new Error('no wrap-up expected')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(swept).toStrictEqual({ alerts: [], sent: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#51'").get()).toStrictEqual({ state: 'closed' });
});

test('it forgets the sessions of a merged run and logs the wrap-up once', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9852', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9852', 'kettle#52', 'kettle-bot');
  closePr(ctx.db, 'kettle#52', { to: 'merged', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9852', 'merged', {}, 'kettle-bot');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });
  const who = { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} };

  await sweepNow(ctx.db, ctx.client, gh, who);
  await sweepNow(ctx.db, ctx.client, gh, who);

  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
  expect(ctx.db.query("SELECT action, subject_id FROM events WHERE action = 'merged-wrap-up'").all()).toStrictEqual([{ action: 'merged-wrap-up', subject_id: 'GEO-9852' }]);
});

test('it still sweeps for alerts when the wrap-up of merged runs throws', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  const log = mock();
  addRun(ctx.db, { issue: 'GEO-9854', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9854', 'kettle#54', 'kettle-bot');
  closePr(ctx.db, 'kettle#54', { to: 'merged', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9854', 'merged', {}, 'kettle-bot');

  ctx.db.exec("CREATE TRIGGER kettle_refuses_wrap_up BEFORE INSERT ON events WHEN NEW.action = 'merged-wrap-up-result' BEGIN SELECT RAISE(ABORT, 'kettle refuses'); END");
  addRun(ctx.db, { issue: 'GEO-9853', title: 'Invented teapot work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9853', 'kettle#53', 'kettle-bot');
  ctx.db.query("UPDATE run_prs SET final_sha = 'abc1234', final_at = '2026-10-21T01:00:00Z', final_source = 'marker:kettle' WHERE ref = 'kettle#53'").run();
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#53': JSON.stringify({ state: 'CLOSED', mergedAt: null, mergeCommit: null }) } });
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });

  const swept = await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('no check expected')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log });

  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
  expect(log.mock.calls).toStrictEqual([['merged-run wrap-up failed: kettle refuses']]);
  expect(swept).toStrictEqual({ alerts: [], sent: [] });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#53'").get()).toStrictEqual({ state: 'closed' });
});

test('it ends a handed-in run\'s idle session and wraps the run up in the same sweep', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9855', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9855', 'kettle#55', 'kettle-bot');
  finalPr(ctx.db, 'kettle#55', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#55', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9855'").get()).toStrictEqual({ state: 'merged' });
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
});

test('it forgets and ends the quiet session of a live-check run once, with one wrap-up result', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9856', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9856', 'kettle#56', 'kettle-bot');
  finalPr(ctx.db, 'kettle#56', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#56', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9856', 'live-check', {}, 'kettle-bot');
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9856'").get()).toStrictEqual({ state: 'live-check' });
  expect(ctx.db.query("SELECT active FROM run_sessions WHERE issue = 'GEO-9856'").all()).toStrictEqual([{ active: 0 }]);
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
  expect(ctx.db.query("SELECT action FROM events WHERE action = 'merged-wrap-up-result'").all()).toHaveLength(1);
});
