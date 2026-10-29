import { expect, test } from 'bun:test';
import { pickRebasedOutcome } from './pick-rebased-outcome.ts';
import type { DiffPatchID } from './read-diff-patch-id.ts';

test('it carries when both diffs have the same patch-id', () => {
  expect(pickRebasedOutcome({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, changed: null })).toStrictEqual({ kind: 'carry', patchID: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' });
});

test.each([
  ['changed files', ['kettle.txt', 'lid.txt'], 'changed: kettle.txt, lid.txt'],
  ['no single changed file', [], "the whole-diff patch-ids differ though no single file's does, as a change of file mode or a rename makes"],
  ['files git could not compare', null, 'the files could not be compared one by one'],
])('it refuses differing patch-ids with %s', (_label, changed, reason) => {
  expect(pickRebasedOutcome({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'patch-id', id: 'd4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4' }, changed })).toStrictEqual({ kind: 'refuse', code: 'not_carried', message: `the diff of zgeoff/widgets#7 at b2b2b2b is not the one the owner approved at a1a1a1a (${reason}); the lgtm is not carried and needs the owner's answer at the new head` });
});

test.each<{ label: string; oldPatchID: DiffPatchID; newPatchID: DiffPatchID; code: 'git_unreadable' | 'not_carried'; message: string }>([
  { label: 'an empty diff at the new head', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'empty' }, code: 'not_carried', message: 'the diff at b2b2b2b is empty against the base of zgeoff/widgets#7, so the lgtm is not carried and nothing is recorded' },
  { label: 'empty diffs at both heads', oldPatchID: { kind: 'empty' }, newPatchID: { kind: 'empty' }, code: 'not_carried', message: 'the diffs at a1a1a1a and b2b2b2b are empty against the base of zgeoff/widgets#7, so the lgtm is not carried and nothing is recorded' },
  { label: 'a diff git cannot read at the old head', oldPatchID: { kind: 'unreadable' }, newPatchID: { kind: 'empty' }, code: 'git_unreadable', message: 'hq could not read the diff at a1a1a1a of zgeoff/widgets#7 in its checkout, so the lgtm is not carried and nothing is recorded' },
  { label: 'a diff git cannot read at the new head', oldPatchID: { kind: 'patch-id', id: 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3' }, newPatchID: { kind: 'unreadable' }, code: 'git_unreadable', message: 'hq could not read the diff at b2b2b2b of zgeoff/widgets#7 in its checkout, so the lgtm is not carried and nothing is recorded' },
])('it refuses $label', (row) => {
  expect(pickRebasedOutcome({ slug: 'zgeoff/widgets', pr: 7, oldHead: 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', newHead: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2', oldPatchID: row.oldPatchID, newPatchID: row.newPatchID, changed: null })).toStrictEqual({ kind: 'refuse', code: row.code, message: row.message });
});
