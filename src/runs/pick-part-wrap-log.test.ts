import { expect, test } from 'bun:test';
import { pickPartWrapLog } from './pick-part-wrap-log.ts';

test.each([
  { title: 'a done wrap-up logs its lines', lines: ['kept kettle-2: pinned'], kind: 'done' as const, previous: 'kept kettle-2: pinned', expected: { lines: ['kept kettle-2: pinned'], fingerprint: null } },
  { title: 'a first retry logs and records its reasons', lines: ['kept kettle-1: unpushed work'], kind: 'retry' as const, previous: null, expected: { lines: ['kept kettle-1: unpushed work'], fingerprint: 'kept kettle-1: unpushed work' } },
  { title: 'a retry for the same reasons logs nothing', lines: ['kept kettle-1: unpushed work'], kind: 'retry' as const, previous: 'kept kettle-1: unpushed work', expected: { lines: [], fingerprint: null } },
  { title: 'a retry for new reasons logs and records them', lines: ['failed kettle-1: atc: timed out'], kind: 'retry' as const, previous: 'kept kettle-1: unpushed work', expected: { lines: ['failed kettle-1: atc: timed out'], fingerprint: 'failed kettle-1: atc: timed out' } },
])('it picks the log when $title', (row) => {
  expect(pickPartWrapLog(row.lines, row.kind, row.previous)).toStrictEqual(row.expected);
});
