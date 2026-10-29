import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { recordAwake } from '../areas/record-awake.ts';
import { setMeta } from '../db/set-meta.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addRun } from '../runs/add-run.ts';
import { setSession } from '../runs/set-session.ts';
import { setState } from '../runs/set-state.ts';
import { readRunningByPlace } from './read-running-by-place.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  return { db: fresh.db };
}

test('it counts a run filed imp whose awake session runs here as local, not imp', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9901'], impIssues: [], localSource: null });
});

test('it counts a run filed imp whose session runs here among the local runs when those runs outnumber the live sessions', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9911', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9912', title: 'Polish the teapot', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9913', title: 'Fill the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9914', title: 'Warm the teapot', place: 'imp', session: 'a0000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 4, issues: ['GEO-9911', 'GEO-9912', 'GEO-9913', 'GEO-9914'], impIssues: [], localSource: null });
});

test('it keeps a run filed imp with awake sessions on both hosts in imp, and counts its session here as local', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9915', title: 'Descale the kettle', place: 'imp', session: 'a0000015-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9915', 'a0000016-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  recordAwake(ctx.db, [
    { id: 'a0000015-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } },
    { id: 'a0000016-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 1, issues: ['GEO-9915'], impIssues: ['GEO-9915'], localSource: '1 live session here' });
});

test('it counts the awake local session of a merged run', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9902', title: 'Polish the teapot', place: 'local', session: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9903', title: 'Fill the kettle', place: 'local', session: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9903', 'merged', {}, 'z-delivery');
  recordAwake(ctx.db, [
    { id: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  const running = readRunningByPlace(ctx.db);

  expect(running.local).toBe(2);
  expect(running.localSource).toBe('2 live sessions here');
});

test('it counts a helper session of a flexible-lane run beside its main session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9904', title: 'Descale the kettle', place: 'local', session: 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9904', 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  recordAwake(ctx.db, [
    { id: 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  const running = readRunningByPlace(ctx.db);

  expect(running.local).toBe(2);
  expect(running.localSource).toBe('2 live sessions here');
});

test("it leaves out a fleet session hq fleet knows, though a run lists it", () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  addRun(ctx.db, { issue: 'GEO-9905', title: 'Descale the kettle', place: 'imp', session: 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-kettle', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9905'], impIssues: ['GEO-9905'], localSource: null });
});

test('it leaves out an awake session atc places on another host', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9906', title: 'Descale the kettle', place: 'imp', session: 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9906'], impIssues: ['GEO-9906'], localSource: null });
});

test('it falls back to the runs filed local when the reading is over 15 min old', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9907', title: 'Descale the kettle', place: 'imp', session: 'a0000008-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000008-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db, new Date('2026-10-15T20:16:00Z'))).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9907'], impIssues: ['GEO-9907'], localSource: null });
});

test('it falls back to the runs filed local on a reading from before the sweep recorded local sessions', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9908', title: 'Descale the kettle', place: 'imp', session: 'a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setMeta(ctx.db, 'atc_awake', JSON.stringify({ at: '2026-10-15T20:00:00Z', ids: ['a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: {}, present: ['a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }));

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9908'], impIssues: ['GEO-9908'], localSource: null });
});

test('it leaves a Design run and its awake session here out of the slot counts, as the Design slot holds it', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9921', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Design: a quieter kettle whistle', place: 'local', session: 'a0000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9922', title: 'Descale the kettle', place: 'local', session: 'a0000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  recordAwake(ctx.db, [
    { id: 'a0000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'whistle-design', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9922'], impIssues: [], localSource: null });
});

test('it counts an owner-chat Investigation run here against the local slots', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9923', type: 'Investigation', title: 'Spike: how loud a kettle may whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9923', title: 'Spike: how loud a kettle may whistle', place: 'local', session: 'a0000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'flexible', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'whistle-spike', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9923'], impIssues: [], localSource: null });
});

test('it leaves a Design run filed imp out of the imp count', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9924', type: 'Design', title: 'Design: a teapot lid that stays on', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9924', title: 'Design: a teapot lid that stays on', place: 'imp', session: 'a0000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'lid-design', alive: true, state: 'running', locator: { targetID: 'imp-teapot' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 0, issues: [], impIssues: [], localSource: null });
});

test('it leaves an agent design run on a non-Design issue out of the slot counts, and counts a pre-v46 run on a Design issue as with-geoff', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9931', type: 'Design', title: 'Design: a teapot lid that stays on', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9930', title: 'Design the kettle spout', place: 'imp', session: 'a0000030-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9931', title: 'Design: a teapot lid that stays on', place: 'imp', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: 'cloud', actor: 'z-delivery' });
  ctx.db.query('UPDATE runs SET design_lane = NULL WHERE issue = ?').run('GEO-9931');
  addRun(ctx.db, { issue: 'GEO-9932', title: 'Descale the kettle', place: 'imp', session: 'a0000032-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [
    { id: 'a0000030-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'spout-design', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000032-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } },
  ]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9932'], impIssues: ['GEO-9932'], localSource: null });
});

test('it counts one live session here for a build run while its design pass session stays awake here', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9932', title: 'Design the teapot lid', place: 'local', session: 'a0000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9932', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9932', title: 'Build the teapot lid', place: 'local', session: 'a0000034-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Building.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  recordAwake(ctx.db, [
    { id: 'a0000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'lid-design', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000034-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'lid-build', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9932'], impIssues: [], localSource: null });
});
