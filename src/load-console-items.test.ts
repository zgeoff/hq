import type { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { createUnblockItems } from '../test/create-unblock-items.ts';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { loadConsoleItems } from './load-console-items.ts';
import { addUnblock } from './unblock/add-unblock.ts';

function setupTest(): Database {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return fresh.db;
}

test('an unblock item with a subject PR is a review with review buttons; any other is a to-do', () => {
  const db = createUnblockItems(setupTest(), {
      'approve-app': { task: 'Approve the invented kettle app', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4' }] },
      'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] },
    }),
    items = loadConsoleItems(db);

  expect(items.map((i) => [i.id, i.kind, i.options.map((o) => (o.noKey === true ? `${o.label} (no key)` : o.label))])).toStrictEqual([
    ['approve-app', 'todo', ['Done', 'Later', 'Skip']],
    ['review-4', 'review', ['lgtm', 'Changes', 'Later', 'Reject (no key)']],
  ]);
});

test('a watch item stays out of the needs-owner list', () => {
  const db = setupTest();
  addUnblock(db, { id: 'descale', task: 'Descale the kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });
  addUnblock(db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });

  expect(loadConsoleItems(db).map((item) => item.id)).toStrictEqual(['descale']);
});
