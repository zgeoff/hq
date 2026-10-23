import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addUnblock } from './add-unblock.ts';
import { newSincePush } from './new-since-push.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it leaves a watch item out of what is pushed to the owner', () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'descale', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });

  expect(newSincePush(ctx.db).map((item) => item.id)).toStrictEqual(['descale']);
});
