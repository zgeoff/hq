import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addNote } from './add-note.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it keeps a late note keyed by the design pass session but marks no build PR final from it', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Design the kettle lid', place: 'local', session: '00000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9733', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Build the kettle lid', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9733', 'kettle#33', 'z-delivery');

  const note = addNote(ctx.db, '00000033', 'the lid sketch is final at 39f05fe', null, 'kettle');

  expect([note.issue, note.session_id]).toStrictEqual(['GEO-9733', '00000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  expect(ctx.db.query("SELECT final_sha FROM run_prs WHERE ref = 'kettle#33'").get()).toStrictEqual({ final_sha: null });
});
