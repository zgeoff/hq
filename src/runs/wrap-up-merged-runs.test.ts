import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';
import { wrapUpMergedRuns } from './wrap-up-merged-runs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test.each(['merged', 'live-check', 'deploy-held'])('it wraps up a %s run whose PRs are all merged or closed', async (state) => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#1', 'z-delivery');
  addPr(ctx.db, 'GEO-9901', 'kettle#2', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged' WHERE ref = 'kettle#1'").run();
  ctx.db.query("UPDATE run_prs SET state = 'closed' WHERE ref = 'kettle#2'").run();
  setState(ctx.db, 'GEO-9901', state, {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'sweep');

  expect(wrapped).toStrictEqual([{ issue: 'GEO-9901', wrapUp: { forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] } }]);
  expect(ctx.db.query("SELECT state FROM runs WHERE issue = 'GEO-9901'").get()).toStrictEqual({ state });
  expect(ctx.db.query("SELECT action FROM events WHERE subject = 'run' AND subject_id = 'GEO-9901' AND action = 'merged-wrap-up'").all()).toStrictEqual([{ action: 'merged-wrap-up' }]);
});

test.each(['working', 'blocked', 'done'])('it skips a %s run', async (state) => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9902', title: 'Invented teapot cosy', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9902', 'teapot#1', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'GEO-9902', state, {}, 'z-delivery');
  const openClient = mock(() => Promise.reject(new Error('no atc expected')));

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient, readImpWork: () => Promise.reject(new Error('no check expected')) }, 'sweep');

  expect(wrapped).toStrictEqual([]);
  expect(openClient).not.toHaveBeenCalled();
});

test('it skips a deploy-held run with an open PR, with no wrap-up note and no news', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9903', title: 'Invented teapot cosy', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9903', 'teapot#1', 'z-delivery');
  addPr(ctx.db, 'GEO-9903', 'teapot#2', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged' WHERE ref = 'teapot#1'").run();
  setState(ctx.db, 'GEO-9903', 'deploy-held', {}, 'z-delivery');

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.reject(new Error('no atc expected')), readImpWork: () => Promise.reject(new Error('no check expected')) }, 'sweep');

  expect(wrapped).toStrictEqual([]);
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM run_notes').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM news').get()).toStrictEqual({ count: 0 });
});

test('it wraps a run up once across two passes', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9904', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9904', 'kettle#1', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'GEO-9904', 'merged', {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) };

  const first = await wrapUpMergedRuns(ctx.db, deps, 'sweep');
  const second = await wrapUpMergedRuns(ctx.db, deps, 'sweep');

  expect(first.map((entry) => entry.issue)).toStrictEqual(['GEO-9904']);
  expect(second).toStrictEqual([]);
  expect(ctx.db.query("SELECT COUNT(*) AS count FROM run_notes WHERE label = 'wrap-up'").get()).toStrictEqual({ count: 1 });
});

test('it wraps a run up again when it went back to working and merged again', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9905', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9905', 'kettle#1', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'GEO-9905', 'merged', {}, 'z-delivery');
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true }] });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) };
  await wrapUpMergedRuns(ctx.db, deps, 'sweep');
  setState(ctx.db, 'GEO-9905', 'working', {}, 'z-delivery');
  setState(ctx.db, 'GEO-9905', 'merged', {}, 'z-delivery');

  const again = await wrapUpMergedRuns(ctx.db, deps, 'sweep');

  expect(again.map((entry) => entry.issue)).toStrictEqual(['GEO-9905']);
});

test('it adds one report news item naming each kept session, and none for a run whose sessions were all forgotten, and not again on the next pass when all were forgotten', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9906', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9906', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addRun(ctx.db, { issue: 'GEO-9907', title: 'Invented teapot cosy', place: 'local', session: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  for (const [issue, ref] of [['GEO-9906', 'kettle#1'], ['GEO-9907', 'teapot#1']] as const) {
    addPr(ctx.db, issue, ref, 'z-delivery');
    setState(ctx.db, issue, 'merged', {}, 'z-delivery');
  }
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, pinned: true },
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
  });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'unknown' as const, detail: 'imp is asleep' }) };

  await wrapUpMergedRuns(ctx.db, deps, 'sweep');
  await wrapUpMergedRuns(ctx.db, deps, 'sweep');

  expect(ctx.db.query('SELECT from_name, topic, text, issue FROM news').all()).toStrictEqual([
    {
      from_name: 'sweep',
      topic: 'report',
      text: 'GEO-9906 merged; wrap-up left kept 0000a001 (the unpushed-work check could not run (imp is asleep), so the imp stays); kept 0000a002 (pinned in atc)',
      issue: 'GEO-9906',
    },
  ]);
});

test('it forgets a session removed from the run by hand', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9908', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9908', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9908', '0000a002', 'z-delivery', 'remove');
  addPr(ctx.db, 'GEO-9908', 'kettle#1', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'GEO-9908', 'merged', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-owner-chat', alive: true },
    ],
  });

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'sweep');

  expect(wrapped[0]?.wrapUp.forgotten).toStrictEqual(['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test('a dry run calls no forget, unpin or destroy and writes no event, note or news', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9909', title: 'Invented kettle descaler', place: 'imp', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9909', '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addPr(ctx.db, 'GEO-9909', 'kettle#1', 'z-delivery');
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  setState(ctx.db, 'GEO-9909', 'merged', {}, 'z-delivery');
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, cwd: '/workspace/kettle' },
      { id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, pinned: true },
    ],
  });
  const count = () => ctx.db.query('SELECT (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM run_notes) AS notes, (SELECT COUNT(*) FROM news) AS news').get();
  const before = count();

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve({ state: 'pushed' }) }, 'sweep', { dryRun: true });

  expect(wrapped).toStrictEqual([
    {
      issue: 'GEO-9909',
      wrapUp: { forgotten: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: ['0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [{ id: '0000a002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] },
    },
  ]);
  expect(fleet.calls).toStrictEqual([]);
  expect(count()).toStrictEqual(before);
});

test('a run whose issue is not a Linear key still gets its news and event, and does not stop the next run', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'kettle-10', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9910', title: 'Invented teapot cosy', place: 'local', session: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  for (const [issue, ref] of [['kettle-10', 'kettle#10'], ['GEO-9910', 'teapot#10']] as const) {
    addPr(ctx.db, issue, ref, 'z-delivery');
    setState(ctx.db, issue, 'merged', {}, 'z-delivery');
  }
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, pinned: true },
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
  });

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'sweep');

  expect(wrapped.map((entry) => entry.issue)).toStrictEqual(['GEO-9910', 'kettle-10']);
  expect(fleet.calls).toStrictEqual(['unpin 0000b001', 'kill 0000b001', 'unpin 0000b001', 'forget 0000b001']);
  expect(ctx.db.query('SELECT text, issue FROM news').all()).toStrictEqual([{ text: 'kettle-10 merged; wrap-up left kept 0000a001 (pinned in atc)', issue: null }]);
  expect(ctx.db.query("SELECT subject_id FROM events WHERE action = 'merged-wrap-up' ORDER BY subject_id").all()).toStrictEqual([{ subject_id: 'GEO-9910' }, { subject_id: 'kettle-10' }]);
});

test('a run whose wrap-up throws is marked wrapped with the failure, and the next run is still wrapped', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9911', title: 'Invented kettle descaler', place: 'local', session: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9912', title: 'Invented teapot cosy', place: 'local', session: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  for (const [issue, ref] of [['GEO-9911', 'kettle#11'], ['GEO-9912', 'teapot#12']] as const) {
    addPr(ctx.db, issue, ref, 'z-delivery');
    setState(ctx.db, issue, 'merged', {}, 'z-delivery');
  }
  ctx.db.query("UPDATE run_prs SET state = 'merged'").run();

  // A run note that cannot be written makes the first run's wrap-up throw.
  ctx.db.exec("CREATE TRIGGER kettle_refuses_note BEFORE INSERT ON run_notes WHEN NEW.issue = 'GEO-9911' BEGIN SELECT RAISE(ABORT, 'kettle refuses'); END");
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000a001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true },
      { id: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true },
    ],
  });

  const wrapped = await wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')) }, 'sweep');

  expect(wrapped.map((entry) => entry.wrapUp.failed.map((failed) => failed.id))).toStrictEqual([['GEO-9911'], []]);
  expect(ctx.db.query("SELECT subject_id FROM events WHERE action = 'merged-wrap-up' ORDER BY subject_id").all()).toStrictEqual([{ subject_id: 'GEO-9911' }, { subject_id: 'GEO-9912' }]);
  expect(ctx.db.query('SELECT text FROM news').all()).toStrictEqual([{ text: 'GEO-9911 merged; wrap-up left failed GEO-9911 (kettle refuses)' }]);
});
