import { expect, test } from 'bun:test';
import { REVIEWER } from '../runs/reviewer.ts';
import { pickAnswerNotice } from './pick-answer-notice.ts';

test('#pickAnswerNotice tells the reviewer about an lgtm', () => {
  expect(pickAnswerNotice({ record: { kind: 'lgtm' }, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', actor: 'z-kettle' })).toStrictEqual({
    next: REVIEWER,
    text: "The owner's lgtm on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes.",
  });
});

test('#pickAnswerNotice names the check in a CI check override', () => {
  expect(pickAnswerNotice({ record: { kind: 'ci-override', check: 'lint' }, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', actor: 'z-kettle' })?.text).toBe(
    "The owner's override of the lint check on widgets#7 is recorded at a1b2c3d. Run `hq review gate widgets 7`, and merge if it passes.",
  );
});

test('#pickAnswerNotice says the head could not be read when it is null', () => {
  expect(pickAnswerNotice({ record: { kind: 'lgtm' }, repo: 'widgets', pr: 7, head: null, actor: 'z-kettle' })).toStrictEqual({
    next: REVIEWER,
    text: "The owner's lgtm on widgets#7 is recorded; its head could not be read. Run `hq review gate widgets 7`, and merge if it passes.",
  });
});

test.each([{ kind: 'changes' }, { kind: 'reject' }] as const)('#pickAnswerNotice returns nothing for $kind', (record) => {
  expect(pickAnswerNotice({ record, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', actor: 'z-kettle' })).toBeNull();
});

test('#pickAnswerNotice returns nothing when the reviewer is the actor', () => {
  expect(pickAnswerNotice({ record: { kind: 'lgtm' }, repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', actor: REVIEWER })).toBeNull();
});
