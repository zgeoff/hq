import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { recordAwake } from '../../areas/record-awake.ts';
import { setMeta } from '../../db/set-meta.ts';
import { writeIssues } from '../../linear/write-issues.ts';
import { addRun } from '../../runs/add-run.ts';
import { setSession } from '../../runs/set-session.ts';
import { setState } from '../../runs/set-state.ts';
import { countWorking } from './count-working.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it counts the awake sessions of a working run, its helper included', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9901', 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  recordAwake(ctx.db, [
    { id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } },
    { id: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } },
  ]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 2, from: 'sessions' });
});

test('it leaves out a session that is not awake', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 0, from: 'sessions' });
});

test('it leaves out a Design run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9921', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Design: a quieter kettle whistle', place: 'local', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'flexible', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'whistle-design', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 0, from: 'sessions' });
});

test('it leaves out a fleet session though a run lists it', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-kettle', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 0, from: 'sessions' });
});

test('it leaves out a blocked run, which waits', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9901', 'blocked', {}, 'z-delivery');
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 0, from: 'sessions' });
});

test('it leaves out a merged run, which waits', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9901', 'merged', {}, 'z-delivery');
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 0, from: 'sessions' });
});

test('it counts an owner-chat Investigation run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9923', type: 'Investigation', title: 'Spike: how loud a kettle may whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9923', title: 'Spike: how loud a kettle may whistle', place: 'local', session: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'flexible', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'whistle-spike', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 1, from: 'sessions' });
});

test('it counts the working runs, less Design ones, when the atc reading is over 15 minutes old', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9921', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Design: a quieter kettle whistle', place: 'local', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'The owner chats.', gate: null, geoffChat: true, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9902', title: 'Polish the teapot', place: 'imp', session: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9902', 'blocked', {}, 'z-delivery');
  recordAwake(ctx.db, [{ id: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:16:00Z'))).toStrictEqual({ count: 1, from: 'runs' });
});

test('it counts the working runs when no atc reading exists', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 1, from: 'runs' });
});

test('it leaves out an agent design run on a non-Design issue, by its design lane', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9930', title: 'Design the kettle spout', place: 'imp', session: 'a0000030-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9932', title: 'Descale the kettle', place: 'imp', session: 'a0000032-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [
    { id: 'a0000030-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'spout-design', alive: true, state: 'running', locator: { targetID: 'imp-spout' } },
    { id: 'a0000032-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } },
  ]);

  expect(countWorking(ctx.db, new Date('2026-10-15T20:00:00Z'))).toStrictEqual({ count: 1, from: 'sessions' });
});
