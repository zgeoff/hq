import { expect, test } from 'bun:test';
import { buildRebasedRefusal } from './build-rebased-refusal.ts';

test('it names the new head when only its diff is empty', () => {
  const refusal = buildRebasedRefusal({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'empty' }, changed: null });

  expect(refusal).toMatchObject({ code: 'not_carried', message: 'the diff at b2b2b2b is empty against the base of zgeoff/widgets#7, so the lgtm is not carried and nothing is recorded' });
});

test('it names both heads when both diffs are empty', () => {
  const refusal = buildRebasedRefusal({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'empty' }, newPatchID: { kind: 'empty' }, changed: null });

  expect(refusal).toMatchObject({ code: 'not_carried', message: 'the diffs at a1a1a1a and b2b2b2b are empty against the base of zgeoff/widgets#7, so the lgtm is not carried and nothing is recorded' });
});

test('it reports a diff git cannot read ahead of an empty one', () => {
  const refusal = buildRebasedRefusal({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'unreadable' }, newPatchID: { kind: 'empty' }, changed: null });

  expect(refusal).toMatchObject({ code: 'git_unreadable', message: 'hq could not read the diff at a1a1a1a of zgeoff/widgets#7 in its checkout, so the lgtm is not carried and nothing is recorded' });
});

test.each([
  [null, 'the files could not be compared one by one'],
  [[], "the whole-diff patch-ids differ though no single file's does, as a change of file mode or a rename makes"],
  [['kettle.txt'], 'changed: kettle.txt'],
])('it explains differing patch-ids with changed files %p', (changed, reason) => {
  const refusal = buildRebasedRefusal({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'patch-id', id: 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4' }, changed });

  expect(refusal).toMatchObject({ code: 'not_carried', message: `the diff of zgeoff/widgets#7 at b2b2b2b is not the one the owner approved at a1a1a1a (${reason}); the lgtm is not carried and needs the owner's answer at the new head` });
});
