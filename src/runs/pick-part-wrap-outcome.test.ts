import { expect, test } from 'bun:test';
import { pickPartWrapOutcome } from './pick-part-wrap-outcome.ts';

test.each([
  { title: 'the session forgotten', forgotten: ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [], expected: { kind: 'done' } },
  { title: 'the session and a sub-session forgotten', forgotten: ['0000e00a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [], expected: { kind: 'done' } },
  { title: 'the session forgotten under a full id in capitals', forgotten: ['0000E001-AAAA-4AAA-8AAA-AAAAAAAAAAAA'], kept: [], failed: [], expected: { kind: 'done' } },
  { title: 'the session kept', forgotten: [], kept: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'its working directory holds unpushed work' }], failed: [], expected: { kind: 'retry' } },
  { title: 'only a sub-session forgotten', forgotten: ['0000e00a-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'atc did not forget the session' }], expected: { kind: 'retry' } },
  { title: 'nothing done', forgotten: [], kept: [], failed: [], expected: { kind: 'retry' } },
])('it picks $expected.kind for $title', (row) => {
  expect(pickPartWrapOutcome('0000e001', { forgotten: [...row.forgotten], destroyed: [], kept: [...row.kept], failed: [...row.failed] })).toStrictEqual(row.expected);
});
