import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addRun } from './add-run.ts';
import { getRun } from './get-run.ts';
import { readDesignMoves } from './read-design-moves.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const queue = (text: string, topic: string) => enqueue(fresh.db, logEvent(fresh.db, 'hq', 'lanes', 'nudged', 'hq-lanes', null, null, {}), 'z-delivery', text, topic);
  const queued = () => fresh.db.query('SELECT text, topic FROM outbox ORDER BY id').all();
  return { db: fresh.db, queue, queued };
}

test('it drops a queued lanes nudge once a run is added, since the nudge may name the new run', () => {
  const ctx = setupTest();
  ctx.queue('2 slots free for 16 min (imp 2, local 0). Take, in this order: GEO-9891, GEO-9892.', 'lanes');
  ctx.queue('The kettle needs descaling.', 'kettle');

  addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(ctx.queued()).toStrictEqual([{ text: 'The kettle needs descaling.', topic: 'kettle' }]);
});

test('it keeps a queued lanes nudge when the run is already open', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  ctx.queue('1 slot free for 16 min (imp 1, local 0). Take: GEO-9892.', 'lanes');

  const added = addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(added.result).toBe('noop');
  expect(ctx.queued()).toStrictEqual([{ text: '1 slot free for 16 min (imp 1, local 0). Take: GEO-9892.', topic: 'lanes' }]);
});

test('it fills the with-geoff lane for a Design-type issue added with no --design flag', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9803', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);

  const added = addRun(ctx.db, { issue: 'GEO-9803', title: 'Design: a quieter kettle whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, actor: 'z-delivery' });

  expect(added.run.design_lane).toBe('with-geoff');
});

test('it adds a delivery run for any other issue added with no --design flag', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');

  const added = addRun(ctx.db, { issue: 'GEO-9801', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(added.run.design_lane).toBeNull();
});

test('it refuses a with-geoff pass above its lane count without --asked', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9804', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  const add = () => addRun(ctx.db, { issue: 'GEO-9805', title: 'Design the kettle lid', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  expect(add).toThrow('GEO-9805: the with-geoff design lane is full at 1 (GEO-9804); pass --asked <where the owner asked> to add it above the count');
});

test('it adds a with-geoff pass above its lane count with --asked, and records where the owner asked', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9804', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  const added = addRun(ctx.db, { issue: 'GEO-9805', title: 'Design the kettle lid', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', asked: 'chat 29 Oct', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  expect(added.run.design_lane).toBe('with-geoff');
  expect(ctx.db.query("SELECT data FROM events WHERE subject_id = 'GEO-9805' AND action = 'added'").get()).toMatchObject({ data: expect.stringContaining('"asked":"chat 29 Oct"') });
});

test('it refuses a Design-type issue added with no --design flag above the with-geoff count', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9806', type: 'Design', title: 'Design: a teapot lid that stays on', state: 'open', closed_at: null }]);
  addRun(ctx.db, { issue: 'GEO-9804', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  const add = () => addRun(ctx.db, { issue: 'GEO-9806', title: 'Design: a teapot lid that stays on', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  expect(add).toThrow('GEO-9806: the with-geoff design lane is full at 1 (GEO-9804)');
});

test('it refuses an agent pass above the agent count, and adds no run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9806', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9807', title: 'Design the kettle lid', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  const add = () => addRun(ctx.db, { issue: 'GEO-9808', title: 'Design the kettle handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', designSlots: { agent: 2, withGeoff: 1 }, actor: 'z-delivery' });

  expect(add).toThrow('GEO-9808: all 2 agent design passes are open (GEO-9806, GEO-9807); close one with hq run done first');
  expect(getRun(ctx.db, 'GEO-9808')).toBeNull();
});

test('it refuses --asked on an agent pass', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');

  const add = () => addRun(ctx.db, { issue: 'GEO-9808', title: 'Design the kettle handle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', asked: 'chat 29 Oct', actor: 'z-delivery' });

  expect(add).toThrow('--asked goes with a with-geoff design pass, not an agent one');
});

test('it refuses --asked on a delivery run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');

  const add = () => addRun(ctx.db, { issue: 'GEO-9809', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, asked: 'chat 29 Oct', actor: 'z-delivery' });

  expect(add).toThrow('--asked goes with a with-geoff design pass, and GEO-9809 gets a delivery run: pass --design with-geoff for a design pass');
});

test('it adds a delivery run while the agent design lanes are full', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9806', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', designSlots: { agent: 1, withGeoff: 1 }, actor: 'z-delivery' });

  const added = addRun(ctx.db, { issue: 'GEO-9809', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, designSlots: { agent: 1, withGeoff: 1 }, actor: 'z-delivery' });

  expect(added.result).toBe('added');
});

test('it refuses a --design pass while the design counts in pacing.json have an error', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');

  const add = () => addRun(ctx.db, { issue: 'GEO-9810', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', designSlots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: agentDesignSlots is wrong', actor: 'z-delivery' });

  expect(add).toThrow('pacing.json: agentDesignSlots is wrong; hq adds no design pass until pacing.json gives its counts');
});

test('it refuses a Design-type issue added with no --design flag while the design counts in pacing.json have an error', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  writeIssues(ctx.db, [{ issue: 'GEO-9810', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);

  const add = () => addRun(ctx.db, { issue: 'GEO-9810', title: 'Design: a quieter kettle whistle', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, designSlots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: designSlots is wrong', actor: 'z-delivery' });

  expect(add).toThrow('pacing.json: designSlots is wrong; hq adds no design pass until pacing.json gives its counts');
});

test('it adds a delivery run while the design counts in pacing.json have an error', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');

  const added = addRun(ctx.db, { issue: 'GEO-9810', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, designSlots: { agent: 2, withGeoff: 1 }, designError: 'pacing.json: designSlots is wrong', actor: 'z-delivery' });

  expect(added.result).toBe('added');
});

test('it turns a closed design run into the build run on run add, and keeps its design pass readable', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Design the kettle spout', place: 'local', session: 'a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9811', 'done', { note: 'design settled' }, 'z-delivery');

  const built = addRun(ctx.db, { issue: 'GEO-9811', title: 'Build the kettle spout', place: 'imp', session: 'a0000012-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  expect(built.result).toBe('added');
  expect(built.run).toMatchObject({ design_lane: null, state: 'working', closed_at: null, title: 'Build the kettle spout', place: 'imp', lane: 'cloud', next: 'Building.' });
  expect(built.run.sessions.map((session) => [session.session_id, session.active])).toStrictEqual([
    ['a0000012-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1],
    ['a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0],
  ]);
  expect(readDesignMoves(ctx.db, 'GEO-9811')).toStrictEqual([{ at: '2026-10-15T20:00:00Z', designLane: 'agent', designSessions: ['a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }]);
});

test('it starts the build run at the move, so its cycle time leaves out the design pass', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9811', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9811', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-17T09:30:00Z');

  const built = addRun(ctx.db, { issue: 'GEO-9811', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  expect(built.run).toMatchObject({ created_at: '2026-10-17T09:30:00Z', updated_at: '2026-10-17T09:30:00Z' });
});

test('it refuses --design on a closed design run, since a new pass needs a reopen', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9812', 'done', { note: 'design settled' }, 'z-delivery');

  const add = () => addRun(ctx.db, { issue: 'GEO-9812', title: 'Design the kettle spout again', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });

  expect(add).toThrow('GEO-9812: its agent design pass is done; a new design pass needs hq run reopen GEO-9812');
});

test('it refuses --asked on the move from a closed design pass to the build run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9812', title: 'Design the kettle spout', place: 'local', session: null, next: 'The owner chats.', gate: null, geoffChat: true, lane: null, design: 'with-geoff', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9812', 'done', { note: 'design settled' }, 'z-delivery');

  const add = () => addRun(ctx.db, { issue: 'GEO-9812', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', asked: 'chat 29 Oct', actor: 'z-delivery' });

  expect(add).toThrow("--asked goes with a new with-geoff design pass; hq run add without --design turns GEO-9812's done design pass into the build run");
});

test('it refuses run add on a closed delivery run', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9813', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9813', 'done', { note: 'shipped' }, 'z-delivery');

  const add = () => addRun(ctx.db, { issue: 'GEO-9813', title: 'Descale the kettle again', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(add).toThrow('GEO-9813 is done: hq run reopen GEO-9813');
});
