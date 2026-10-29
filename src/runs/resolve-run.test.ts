import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { resolveRun } from './resolve-run.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it refuses a design pass session as the key to change the build run by', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9734', title: 'Design the kettle base', place: 'local', session: '00000034-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9734', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9734', title: 'Build the kettle base', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });

  const resolve = () => resolveRun(ctx.db, '00000034');

  expect(resolve).toThrow("00000034 is a session of GEO-9734's design pass, which became the build run: name GEO-9734 to change the build run");
});

test('it gives a reader the build run by its design pass session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9734', title: 'Design the kettle base', place: 'local', session: '00000034-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9734', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9734', title: 'Build the kettle base', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });

  const run = resolveRun(ctx.db, '00000034', 'allow');

  expect([run.issue, run.title]).toStrictEqual(['GEO-9734', 'Build the kettle base']);
});
