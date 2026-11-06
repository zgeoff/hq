import { expect, mock, onTestFinished, test } from 'bun:test';
import { AtcClient } from '../atc/atc-client.ts';
import { overrideEnv } from '../config/override-env.ts';
import { readEvents } from '../read-events.ts';
import { buildStubGitHubFactsRunner } from '../../test/build-stub-github-facts-runner.ts';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { fakeAtc, freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { finalPr } from './final-pr.ts';
import { getRun } from './get-run.ts';
import { setState } from './set-state.ts';
import { sweepNow } from './sweep-now.ts';
import { viewRun } from './view-run.ts';

async function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const roster: { id: string; name: string; alive: boolean; state: string; parent?: string; lastMsg?: string }[] = [];
  const server = fakeAtc(fresh.dir, roster);
  onTestFinished(server.stop);
  const client = await AtcClient.open();
  onTestFinished(() => client.close());

  return {
    db: fresh.db,
    client,
    fake: { sessions: roster, activity: server.activity, pending: server.pending },
    readState: (issue: string) => getRun(fresh.db, issue)?.state,
    readActive: (issue: string) => {
      const run = getRun(fresh.db, issue);
      return run === null ? [] : viewRun(fresh.db, run).sessions.map((session) => session.active);
    },
  };
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
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });
  const who = { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} };

  await sweepNow(ctx.db, ctx.client, gh, who);
  await sweepNow(ctx.db, ctx.client, gh, who);

  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
  expect(readEvents(ctx.db, 'run', 'GEO-9852', ['merged-wrap-up'])).toHaveLength(1);
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
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });

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
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.readState('GEO-9855')).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
});

test('it keeps a handed-in run working while it waits on parts and its Scope has an open box, then hands it in once the box is ticked', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9856', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9856', 'working', { waitsOn: 'free slots for the widgets#9 part' }, 'kettle-bot');
  addPr(ctx.db, 'GEO-9856', 'kettle#56', 'kettle-bot');
  finalPr(ctx.db, 'kettle#56', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#56', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });
  const log = mock();
  const readIssueDescription = mock()
    .mockResolvedValueOnce('## Scope\n\n- [x] kettle: done\n- [ ] widgets: the next part\n')
    .mockResolvedValueOnce('## Scope\n\n- [x] kettle: done\n- [ ] widgets: the next part\n')
    .mockResolvedValueOnce('## Scope\n\n- [x] kettle: done\n- [x] widgets: the next part\n');
  const options = { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log, readIssueDescription };

  await sweepNow(ctx.db, ctx.client, gh, options);
  await sweepNow(ctx.db, ctx.client, gh, options);

  expect(ctx.readState('GEO-9856')).toBe('working');
  expect(fleet.calls).toStrictEqual([]);
  expect(log.mock.calls).toStrictEqual([['handed-in held for GEO-9856: it waits on more parts and its Linear Scope has 1 open box']]);

  await sweepNow(ctx.db, ctx.client, gh, options);

  expect(ctx.readState('GEO-9856')).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
});

test('it keeps a handed-in run working and logs a line when the Linear read fails', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9857', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9857', 'working', { waitsOn: 'free slots for the widgets#9 part' }, 'kettle-bot');
  addPr(ctx.db, 'GEO-9857', 'kettle#57', 'kettle-bot');
  finalPr(ctx.db, 'kettle#57', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#57', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });
  const log = mock();

  await sweepNow(ctx.db, ctx.client, gh, {
    actor: 'z-delivery',
    wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) },
    log,
    readIssueDescription: () => Promise.reject(new Error('Linear answered 500')),
  });

  expect(ctx.readState('GEO-9857')).toBe('working');
  expect(fleet.calls).toStrictEqual([]);
  expect(log.mock.calls).toStrictEqual([['handed-in held for GEO-9857: could not read its Linear Scope (Linear answered 500)']]);
});

test('it never reads Linear for a handed-in run that waits on nothing', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9858', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9858', 'kettle#58', 'kettle-bot');
  finalPr(ctx.db, 'kettle#58', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#58', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });
  const readIssueDescription = mock(() => Promise.resolve('## Scope\n\n- [ ] widgets: the next part\n'));

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {}, readIssueDescription });

  expect(readIssueDescription.mock.calls).toStrictEqual([]);
  expect(ctx.readState('GEO-9858')).toBe('merged');
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
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.readState('GEO-9856')).toBe('live-check');
  expect(ctx.readActive('GEO-9856')).toStrictEqual([0]);
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
  expect(readEvents(ctx.db, 'run', 'GEO-9856', ['merged-wrap-up-result'])).toHaveLength(1);
});

test('it opens one atc client for both the handed-in pass and the merged-run pass', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9857', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9857', 'kettle#57', 'kettle-bot');
  finalPr(ctx.db, 'kettle#57', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#57', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  addRun(ctx.db, { issue: 'GEO-9858', title: 'Invented teapot work', place: 'local', session: '0000d002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9858', 'kettle#58', 'kettle-bot');
  closePr(ctx.db, 'kettle#58', { to: 'merged', actor: 'kettle-bot' });
  setState(ctx.db, 'GEO-9858', 'merged', {}, 'kettle-bot');
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' },
      { id: '0000d002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'done' },
    ],
  });
  const openClient = mock(() => Promise.resolve(fleet.client));
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient, readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001', 'unpin 0000d002', 'kill 0000d002', 'unpin 0000d002', 'forget 0000d002']);
  expect(openClient).toHaveBeenCalledTimes(1);
});

test('it keeps a handed-in run whose sub-session atc shows recently active', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9859', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9859', 'kettle#59', 'kettle-bot');
  finalPr(ctx.db, 'kettle#59', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#59', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push(
    { id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' },
    { id: '0000d003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-sketch', alive: true, state: 'done', parent: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  );
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  ctx.fake.activity.set('0000d003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T02:50:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' },
      { id: '0000d003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-sketch', alive: true, state: 'done', parent: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
  });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(fleet.calls).toStrictEqual([]);
});

test('it keeps a handed-in run whose running sub-session the wrap-up client lists but the sweep atc list does not', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9860', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9860', 'kettle#60', 'kettle-bot');
  finalPr(ctx.db, 'kettle#60', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#60', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  ctx.fake.activity.set('0000d003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' },
      { id: '0000d003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-sketch', alive: true, state: 'running', parent: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
  });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.readActive('GEO-9860')).toStrictEqual([1]);
});

test('it opens no wrap-up client for a sweep with no handed-in run', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9861', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9861', 'kettle#61', 'kettle-bot');
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done' });
  const openClient = mock(() => Promise.reject(new Error('no wrap-up client expected')));
  const gh = buildStubGitHubFactsRunner({ views: { 'kettle#61': JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null }) } });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient, readImpWork: () => Promise.reject(new Error('no check expected')), readLocalWork: () => Promise.reject(new Error('no check expected')) }, log: () => {} });

  expect(openClient).not.toHaveBeenCalled();
});

test("it hands in a run whose session atc shows waiting on Claude's idle notice", async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9862', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9862', 'kettle#62', 'kettle-bot');
  finalPr(ctx.db, 'kettle#62', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#62', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'needs_you' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T01:41:00Z'));
  ctx.fake.pending.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { message: 'Claude is waiting for your input' });
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'needs_you' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.readState('GEO-9862')).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
});

test('it hands in a run whose session atc revived after a restart and shows running with old activity', async () => {
  const ctx = await setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-21T03:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9863', title: 'Invented kettle work', place: 'local', session: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'kettle-bot' });
  addPr(ctx.db, 'GEO-9863', 'kettle#63', 'kettle-bot');
  finalPr(ctx.db, 'kettle#63', { sha: 'abc1234', actor: 'kettle-bot' });
  closePr(ctx.db, 'kettle#63', { to: 'merged', actor: 'kettle-bot', facts: { mergedAt: '2026-10-21T01:00:00Z', mergeSha: null } });
  ctx.fake.sessions.push({ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', lastMsg: 'revived' });
  ctx.fake.activity.set('0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-21T00:13:00Z'));
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', lastMsg: 'revived' }] });
  const gh = buildStubGitHubFactsRunner({ views: {} });

  await sweepNow(ctx.db, ctx.client, gh, { actor: 'z-delivery', wrapUpDeps: { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, log: () => {} });

  expect(ctx.readState('GEO-9863')).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000d001', 'kill 0000d001', 'unpin 0000d001', 'forget 0000d001']);
});
