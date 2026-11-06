import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addOwnedPr } from './add-owned-pr.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { applyNoteSignals } from './apply-note-signals.ts';
import { setSession } from './set-session.ts';
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

test('it sets the PR owner to the session an atc FINAL marker names, resolved to the run session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9952', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9952', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addPr(ctx.db, 'GEO-9952', 'kettle#81', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-9952', 'FINAL kettle#81 39f05fe', { source: 'atc:0000f001' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#81'").get()).toStrictEqual({ session_id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it stores the marker session as given when the run has no matching session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9953', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9953', 'kettle#82', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-9953', 'FINAL kettle#82 39f05fe', { source: 'atc:0000f009' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#82'").get()).toStrictEqual({ session_id: '0000f009' });
});

test('it keeps an owner set by hand when an atc FINAL marker names another session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9954', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9954', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9954', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-9954', 'kettle#83', { actor: 'z-delivery', session: '0000f002' });

  applyNoteSignals(ctx.db, 'GEO-9954', 'FINAL kettle#83 39f05fe', { source: 'atc:0000f001' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#83'").get()).toStrictEqual({ session_id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it sets no owner for a FINAL marker from the cli', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9955', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9955', 'kettle#84', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-9955', 'FINAL kettle#84 39f05fe', { source: 'cli' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#84'").get()).toStrictEqual({ session_id: null });
});
