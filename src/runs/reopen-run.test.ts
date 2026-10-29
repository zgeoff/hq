import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { checkDesignReopen, reopenRun } from './reopen-run.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it refuses to reopen an agent pass while both agent lanes are full', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9871', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9871', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9872', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9873', title: 'Design the kettle handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const reopen = () => reopenRun(ctx.db, { issue: 'GEO-9871', next: 'Reopened: agent working.', design: { error: null, asked: null }, actor: 'z-delivery' });

  expect(reopen).toThrow('GEO-9871: all 2 agent design passes are open (GEO-9872, GEO-9873); close one with hq run done first');
});

test('it reopens an agent pass while an agent lane is free', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9871', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9871', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9872', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const reopened = reopenRun(ctx.db, { issue: 'GEO-9871', next: 'Reopened: agent working.', design: { error: null, asked: null }, actor: 'z-delivery' });

  expect(reopened.state).toBe('working');
});

test('it refuses to reopen a with-geoff pass above its lane count without --asked', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9874', title: 'Design the whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9874', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9875', title: 'Design the handle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });

  const reopen = () => reopenRun(ctx.db, { issue: 'GEO-9874', next: 'Reopened: the owner chats.', design: { error: null, asked: null }, actor: 'z-delivery' });

  expect(reopen).toThrow('GEO-9874: the with-geoff design lane is full at 1 (GEO-9875); pass --asked <where the owner asked> to add it above the count');
});

test('it reopens a with-geoff pass above its lane count with --asked, and records where the owner asked', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9874', title: 'Design the whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9874', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9875', title: 'Design the handle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });

  reopenRun(ctx.db, { issue: 'GEO-9874', next: 'Reopened: the owner chats.', design: { error: null, asked: 'chat 30 Oct' }, actor: 'z-delivery' });

  expect(ctx.db.query("SELECT data FROM events WHERE subject_id = 'GEO-9874' AND action = 'design-asked'").all()).toStrictEqual([{ data: '{"designLane":"with-geoff","asked":"chat 30 Oct"}' }]);
});

test('it refuses --asked on reopening a delivery run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9876', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9876', 'done', { note: 'design settled' }, 'z-delivery');

  const reopen = () => reopenRun(ctx.db, { issue: 'GEO-9876', next: 'Reopened: agent working.', design: { error: null, asked: 'chat 30 Oct' }, actor: 'z-delivery' });

  expect(reopen).toThrow('--asked goes with reopening a with-geoff design pass, and GEO-9876 is a delivery run');
});

test('it reopens a delivery run while the agent design lanes are full', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9876', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9876', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9872', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9873', title: 'Design the kettle handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const reopened = reopenRun(ctx.db, { issue: 'GEO-9876', next: 'Reopened: agent working.', design: { error: null, asked: null }, actor: 'z-delivery' });

  expect(reopened.state).toBe('working');
});

test('it checks no lane count for a design pass that is still open', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9872', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9873', title: 'Design the kettle handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  const lane = checkDesignReopen(ctx.db, 'GEO-9872', { error: null, asked: null });

  expect(lane).toBeNull();
});
