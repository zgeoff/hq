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
  addRun(ctx.db, { issue: 'GEO-507', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-507', 'kettle#71', 'z-delivery');
  setState(ctx.db, 'GEO-507', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-507', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-507', 'kettle#72', 'z-delivery');

  expect(applyNoteSignals(ctx.db, 'GEO-507', 'The spout work is final at 39f05fe', { source: 'test' })).toStrictEqual({ prs: [], final: 'kettle#72' });
});

test('it sets the PR owner to the session an atc FINAL marker names, resolved to the run session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-502', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-502', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addPr(ctx.db, 'GEO-502', 'kettle#81', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-502', 'FINAL kettle#81 39f05fe', { source: 'atc:0000f001' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#81'").get()).toStrictEqual({ session_id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it stores the marker session as given when the run has no matching session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-503', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-503', 'kettle#82', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-503', 'FINAL kettle#82 39f05fe', { source: 'atc:0000f009' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#82'").get()).toStrictEqual({ session_id: '0000f009' });
});

test('it keeps an owner set by hand when an atc FINAL marker names another session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-504', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-504', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-504', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-504', 'kettle#83', { actor: 'z-delivery', session: '0000f002' });

  applyNoteSignals(ctx.db, 'GEO-504', 'FINAL kettle#83 39f05fe', { source: 'atc:0000f001' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#83'").get()).toStrictEqual({ session_id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it sets no owner for a FINAL marker from the cli', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-505', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-505', 'kettle#84', 'z-delivery');

  applyNoteSignals(ctx.db, 'GEO-505', 'FINAL kettle#84 39f05fe', { source: 'cli' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#84'").get()).toStrictEqual({ session_id: null });
});

test('it hands the owner to the session of a later FINAL marker when an earlier marker set it', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-506', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-506', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-506', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addPr(ctx.db, 'GEO-506', 'kettle#85', 'z-delivery');
  applyNoteSignals(ctx.db, 'GEO-506', 'FINAL kettle#85 39f05fe', { source: 'atc:0000f001' });

  applyNoteSignals(ctx.db, 'GEO-506', 'FINAL kettle#85 4a1b2c3', { source: 'atc:0000f002' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#85'").get()).toStrictEqual({ session_id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it hands the owner to the session of a later FINAL marker at the same SHA', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-508', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-508', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-508', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addPr(ctx.db, 'GEO-508', 'kettle#86', 'z-delivery');
  applyNoteSignals(ctx.db, 'GEO-508', 'FINAL kettle#86 39f05fe', { source: 'atc:0000f001' });

  applyNoteSignals(ctx.db, 'GEO-508', 'FINAL kettle#86 39f05fe', { source: 'atc:0000f002' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#86'").get()).toStrictEqual({ session_id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});

test('it keeps an owner set by hand when an atc FINAL marker at the same SHA names another session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-509', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-509', '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-509', '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  addOwnedPr(ctx.db, 'GEO-509', 'kettle#87', { actor: 'z-delivery', session: '0000f002' });
  applyNoteSignals(ctx.db, 'GEO-509', 'FINAL kettle#87 39f05fe', { source: 'atc:0000f002' });

  applyNoteSignals(ctx.db, 'GEO-509', 'FINAL kettle#87 39f05fe', { source: 'atc:0000f001' });

  expect(ctx.db.query("SELECT session_id FROM run_prs WHERE ref = 'kettle#87'").get()).toStrictEqual({ session_id: '0000f002-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
});
