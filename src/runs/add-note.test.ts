import { expect, onTestFinished, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addNote } from './add-note.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { listRuns } from './list-runs.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { resolveNoteFinals } from './resolve-note-finals.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  const finalSha = () => listRuns(fresh.db)[0]?.prs[0]?.final_sha;
  const notices = () => fresh.db.query(`SELECT target, text FROM outbox WHERE target != 'z-review'`).all();
  return { db: fresh.db, finalSha, notices };
}

test('it keeps the text of a note whose FINAL names no commit and sets no final mark', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'FINAL kettle#714 4423866e all green';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  const stored = addNote(ctx.db, 'GEO-9731', text, {
    label: null,
    actor: 'z-delivery',
    resolutions,
  });

  expect(stored.text).toBe('FINAL kettle#714 4423866e all green');
  expect(ctx.finalSha()).toBeNull();
});

test('it tells the orchestrator both shas of a note whose FINAL names no commit', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'FINAL kettle#714 4423866e all green';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.notices()).toStrictEqual([
    {
      target: 'z-delivery',
      text: 'GEO-9731: the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha',
    },
  ]);
});

test('it stores the full sha of a FINAL marker', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'FINAL kettle#714 44238662 all green';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.finalSha()).toBe(head);
});

test('it stores the full sha of a FINAL phrase', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'kettle#714 is final at 44238662';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.finalSha()).toBe(head);
});

test('it sets no final mark for a FINAL phrase of a sha that is no commit of the PR', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'kettle#714 is final at 4423866e';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.finalSha()).toBeNull();
});

test('it tells the orchestrator when a FINAL phrase names a sha that is no commit of the PR', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const text = 'kettle#714 is final at 4423866e';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.notices()).toStrictEqual([
    {
      target: 'z-delivery',
      text: 'GEO-9731: the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha',
    },
  ]);
});

test('it asks GitHub nothing about a FINAL phrase that names a PR of another run', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [`44238662${buildMockSha(2).slice(8)}`] }, calls));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');

  await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', 'toaster#88 is final at 44238662');

  expect(calls).toStrictEqual([]);
});

test('it tells the orchestrator nothing of a FINAL that names no commit of a merged PR', async () => {
  const ctx = setupTest();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  addRun(ctx.db, {
    issue: 'GEO-9731',
    title: 'Invented kettle work',
    place: 'local',
    session: null,
    next: 'Agent working.',
    gate: null,
    geoffChat: false,
    actor: 'z-delivery',
  });
  addPr(ctx.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  closePr(ctx.db, 'kettle#714', { to: 'merged', actor: 'z-review' });
  const text = 'FINAL kettle#714 4423866e all green';
  const resolutions = await resolveNoteFinals(ctx.db, resolveFinal, 'GEO-9731', text);

  addNote(ctx.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });

  expect(ctx.notices()).toStrictEqual([]);
});

test('it keeps a late note keyed by the design pass session but marks no build PR final from it', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Design the kettle lid', place: 'local', session: '00000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9733', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Build the kettle lid', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9733', 'kettle#33', 'z-delivery');

  const note = addNote(ctx.db, '00000033', 'the lid sketch is final at 39f05fe', { label: null, actor: 'kettle' });

  expect([note.issue, note.session_id]).toStrictEqual(['GEO-9733', '00000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  expect(ctx.db.query("SELECT final_sha FROM run_prs WHERE ref = 'kettle#33'").get()).toStrictEqual({ final_sha: null });
});

test('it asks GitHub nothing about a FINAL in a late note keyed by the design pass session', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [`39f05fe${buildMockSha(3).slice(7)}`] }, calls));
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Design the kettle lid', place: 'local', session: '00000033-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9733', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9733', title: 'Build the kettle lid', place: 'local', session: null, next: 'Building.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9733', 'kettle#33', 'z-delivery');

  await resolveNoteFinals(ctx.db, resolveFinal, '00000033', 'the lid sketch is final at 39f05fe');

  expect(calls).toStrictEqual([]);
});
