import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { addRun } from './add-run.ts';

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
