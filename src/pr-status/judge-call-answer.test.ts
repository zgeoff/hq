import { expect, test } from 'bun:test';
import { judgeCallAnswer } from './judge-call-answer.ts';

// An lgtm on widgets#7 at a1b2c3d from call:KET-50.
function setupTest() {
  return { request: { ref: { repo: 'widgets', pr: 7, slug: 'zgeoff/widgets' }, answer: 'lgtm', source: 'call:KET-50', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } as const };
}

test('it takes a plain Yes on a call that names the PR, and any owner answer for reject', () => {
  const ctx = setupTest();

  expect(judgeCallAnswer(ctx.request, { title: 'lgtm widgets#7?', answer: 'Yes' })).toBeNull();
  expect(judgeCallAnswer({ ...ctx.request, answer: 'reject' }, { title: 'Reject widgets#7?', answer: 'Drop it' })).toBeNull();
});

test.each([
  ['no call', null, 'call:KET-50 is not a call in hq'],
  ['no owner answer', { title: 'lgtm widgets#7?', answer: null }, "call:KET-50 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller"],
  ['a call for another PR', { title: 'lgtm teapots#7?', answer: 'Yes' }, 'call:KET-50 does not name zgeoff/widgets#7 in the title the owner answered'],
  ['an answer that is not a plain Yes', { title: 'lgtm widgets#7?', answer: 'Yes, but not yet' }, 'the owner\'s answer to call:KET-50 is not a plain yes: "Yes, but not yet"'],
])('it refuses lgtm with %s', (_label, evidence, why) => {
  const ctx = setupTest();

  expect(judgeCallAnswer(ctx.request, evidence)).toBe(why);
});
