import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addAsk } from './add-ask.ts';
import { openAsk } from './open-ask.ts';
import { runCallAnswer } from './run-call-answer.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test.each([
  ['owner', 1],
  ['other', null],
] as const)("a %s caller's answer is saved, marked as the owner's only for the owner", async (verdict, mark) => {
  const ctx = setupTest();
  addAsk(ctx.db, { kind: 'call', id: 'KET-41', title: 'Pour now?', question: 'Boil?', body: 'Invented.', issues: [], forSession: null, actor: 'z-kettle' });
  openAsk(ctx.db, { id: 'KET-41', force: true, actor: 'z-stu' });

  await runCallAnswer(ctx.db, { id: 'KET-41', kind: 'call', answer: 'Yes', actor: 'z-stu' }, () => Promise.resolve({ verdict }));

  expect(ctx.db.query("SELECT json_extract(data, '$.ownerSession') AS mark FROM events WHERE subject_id = 'KET-41' AND action = 'answered'").all()).toStrictEqual([{ mark }]);
});

test('an answer atc cannot place is refused with the cause, and nothing is saved', async () => {
  const ctx = setupTest();
  addAsk(ctx.db, { kind: 'call', id: 'KET-42', title: 'Pour now?', question: 'Boil?', body: 'Invented.', issues: [], forSession: null, actor: 'z-kettle' });
  openAsk(ctx.db, { id: 'KET-42', force: true, actor: 'z-stu' });

  const answered = runCallAnswer(ctx.db, { id: 'KET-42', kind: 'call', answer: 'Yes', actor: 'z-stu' }, () => Promise.resolve({ verdict: 'unknown', cause: 'no socket' }));

  await expect(answered).rejects.toMatchObject({ code: 'atc_unreachable', message: "atc could not say whether this caller is the owner's session (z-stu), so the answer is not saved: no socket. Run it again once atc answers, or answer in the console" });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE subject_id = 'KET-42' AND action = 'answered'").get()).toStrictEqual({ total: 0 });
});
