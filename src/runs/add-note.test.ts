import { expect, onTestFinished, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubFinalGH } from '../../test/build-stub-final-gh.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { addNote } from './add-note.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { listRuns } from './list-runs.ts';
import { makeFinalResolver } from './make-final-resolver.ts';
import { resolveNoteFinals } from './resolve-note-finals.ts';

// A run with one PR, kettle#714, whose only commit is the head, and a gh that knows it.
function setupTest() {
  const fresh = freshDb();
  const head = `44238662${buildMockSha(2).slice(8)}`;
  const resolveFinal = makeFinalResolver(buildStubFinalGH({ commits: [head] }, []));
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9731', title: 'Invented kettle work', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9731', 'kettle#714', 'z-delivery');
  const finalSha = () => listRuns(fresh.db)[0]?.prs[0]?.final_sha;
  const note = async (text: string) => {
    const resolutions = await resolveNoteFinals(fresh.db, resolveFinal, 'GEO-9731', text);
    return addNote(fresh.db, 'GEO-9731', text, { label: null, actor: 'z-delivery', resolutions });
  };
  const notices = () => fresh.db.query(`SELECT target, text FROM outbox WHERE target != 'z-review'`).all();
  return { head, finalSha, note, notices };
}

test('it keeps a note whose FINAL names no commit, marks nothing, and tells the orchestrator both shas', async () => {
  const ctx = setupTest();

  const stored = await ctx.note('FINAL kettle#714 4423866e all green');

  expect(stored.text).toBe('FINAL kettle#714 4423866e all green');
  expect(ctx.finalSha()).toBeNull();
  expect(ctx.notices()).toStrictEqual([{ target: 'z-delivery', text: 'GEO-9731: the FINAL names 4423866e, which is no commit of zgeoff/kettle#714; its head is 44238662 - send the FINAL again at that sha' }]);
});

test('it stores the full sha of a FINAL marker', async () => {
  const ctx = setupTest();

  await ctx.note('FINAL kettle#714 44238662 all green');

  expect(ctx.finalSha()).toBe(ctx.head);
});

test('it stores the full sha of a FINAL phrase', async () => {
  const ctx = setupTest();

  await ctx.note('kettle#714 is final at 44238662');

  expect(ctx.finalSha()).toBe(ctx.head);
});

test('it refuses the FINAL phrase of a sha that is no commit of the PR', async () => {
  const ctx = setupTest();

  await ctx.note('kettle#714 is final at 4423866e');

  expect([ctx.finalSha(), ctx.notices()]).toMatchObject([null, [{ target: 'z-delivery' }]]);
});
