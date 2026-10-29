import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { applyNoteSignals } from './apply-note-signals.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it marks the open PR of the build run final from a note that names no PR, past the open PR of its design pass', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9951', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9951', 'kettle#71', 'z-delivery');
  setState(ctx.db, 'GEO-9951', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9951', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9951', 'kettle#72', 'z-delivery');

  expect(applyNoteSignals(ctx.db, 'GEO-9951', 'The spout work is final at 39f05fe', { source: 'test' })).toStrictEqual({ prs: [], final: 'kettle#72' });
});
