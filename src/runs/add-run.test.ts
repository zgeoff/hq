import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { writeIssues } from '../linear/write-issues.ts';
import { addRun } from './add-run.ts';
import { getRun } from './get-run.ts';
import { readDesignMoves } from './read-design-moves.ts';
import { setState } from './set-state.ts';
import { viewRun } from './view-run.ts';
import type { AddRunInput } from './types.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const queue = (text: string, topic: string) => enqueue(fresh.db, logEvent(fresh.db, 'hq', 'lanes', 'nudged', 'hq-lanes', null, null, {}), 'z-delivery', text, topic);
  const queued = () => fresh.db.query('SELECT text, topic FROM outbox ORDER BY id').all();

  // Runs with room for 2 agent and 1 with-geoff design pass, each added by z-delivery at 20:00Z.
  const add = (issue: string, extra: Partial<AddRunInput> = {}) => {
    at('2026-10-15T20:00:00Z');
    return addRun(fresh.db, { issue, title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery', designSlots: { agent: 2, withGeoff: 1 }, ...extra });
  };
  return { db: fresh.db, queue, queued, add };
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

test('a Design-type issue run with no --design flag fills the with-geoff lane', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9803', type: 'Design', title: 'Design: a quieter kettle whistle', state: 'open', closed_at: null }]);

  const added = ctx.add('GEO-9803', { geoffChat: true });

  expect(added.run.design_lane).toBe('with-geoff');
});

test('a run for any other issue with no --design flag is a delivery run', () => {
  const ctx = setupTest();

  expect(ctx.add('GEO-9801', { title: 'Descale the kettle' }).run.design_lane).toBeNull();
});

test('a with-geoff pass above its lane count is refused without --asked, and with it starts and records where the owner asked', () => {
  const ctx = setupTest();
  ctx.add('GEO-9804', { design: 'with-geoff' });

  expect(() => ctx.add('GEO-9805', { design: 'with-geoff' })).toThrow('the with-geoff design lane is full at 1 (GEO-9804); pass --asked');
  const asked = ctx.add('GEO-9805', { design: 'with-geoff', asked: 'chat 29 Oct' });

  expect(asked.run.design_lane).toBe('with-geoff');
  expect(ctx.db.query("SELECT data FROM events WHERE subject_id = 'GEO-9805' AND action = 'added'").get()).toMatchObject({ data: expect.stringContaining('"asked":"chat 29 Oct"') });
});

test('a Design-type default run above the with-geoff count follows the same rule', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [{ issue: 'GEO-9806', type: 'Design', title: 'Design: a teapot lid that stays on', state: 'open', closed_at: null }]);
  ctx.add('GEO-9804', { design: 'with-geoff' });

  expect(() => ctx.add('GEO-9806')).toThrow('the with-geoff design lane is full');
});

test('an agent pass over the agent count is refused, whatever --asked says, and a delivery run is not refused', () => {
  const ctx = setupTest();
  ctx.add('GEO-9806', { design: 'agent' });
  ctx.add('GEO-9807', { design: 'agent' });

  expect(() => ctx.add('GEO-9808', { design: 'agent' })).toThrow('all 2 agent design passes are open (GEO-9806, GEO-9807)');
  expect(() => ctx.add('GEO-9808', { design: 'agent', asked: 'chat 29 Oct' })).toThrow('--asked goes with a with-geoff design pass');
  expect(getRun(ctx.db, 'GEO-9808')).toBeNull();
  expect(ctx.add('GEO-9809', { title: 'Descale the kettle' }).result).toBe('added');
});

test('a closed design run turns into the build run on run add, and its design pass stays readable', () => {
  const ctx = setupTest();
  const designSession = 'a0000011-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const buildSession = 'a0000012-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  ctx.add('GEO-9811', { design: 'agent', session: designSession });
  setState(ctx.db, 'GEO-9811', 'done', { note: 'design settled' }, 'z-delivery');

  const built = ctx.add('GEO-9811', { title: 'Build the kettle spout', session: buildSession, next: 'Building.', place: 'imp', lane: 'cloud' });

  const view = viewRun(ctx.db, getRun(ctx.db, 'GEO-9811') ?? built.run);
  expect(built.result).toBe('added');
  expect([view.design_lane, view.state, view.closed_at, view.title, view.place, view.lane, view.next]).toStrictEqual([null, 'working', null, 'Build the kettle spout', 'imp', 'cloud', 'Building.']);
  expect(view.sessions.map((session) => [session.session_id, session.active])).toStrictEqual([
    [buildSession, 1],
    [designSession, 0],
  ]);
  expect(readDesignMoves(ctx.db, 'GEO-9811')).toStrictEqual([{ at: '2026-10-15T20:00:00Z', designLane: 'agent', designSessions: [designSession] }]);
});

test('a closed delivery run still refuses run add', () => {
  const ctx = setupTest();
  ctx.add('GEO-9813', { title: 'Descale the kettle' });
  setState(ctx.db, 'GEO-9813', 'done', { note: 'shipped' }, 'z-delivery');

  expect(() => ctx.add('GEO-9813', { title: 'Descale the kettle again' })).toThrow('GEO-9813 is done: hq run reopen GEO-9813');
});
