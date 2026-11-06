import { expect, test } from 'bun:test';
import { pickPartWrapLog } from './pick-part-wrap-log.ts';

test.each([
  ['a done wrap-up logs its lines', ['kept kettle-2: pinned'], 'done' as const, 'kept kettle-2: pinned', { lines: ['kept kettle-2: pinned'], fingerprint: null }],
  ['a first retry logs and records its reasons', ['kept kettle-1: unpushed work'], 'retry' as const, null, { lines: ['kept kettle-1: unpushed work'], fingerprint: 'kept kettle-1: unpushed work' }],
  ['a retry for the same reasons logs nothing', ['kept kettle-1: unpushed work'], 'retry' as const, 'kept kettle-1: unpushed work', { lines: [], fingerprint: null }],
  ['a retry for new reasons logs and records them', ['failed kettle-1: atc: timed out'], 'retry' as const, 'kept kettle-1: unpushed work', { lines: ['failed kettle-1: atc: timed out'], fingerprint: 'failed kettle-1: atc: timed out' }],
])('it picks the log when %s', (_case, lines, kind, previous, expected) => {
  expect(pickPartWrapLog(lines, kind, previous)).toStrictEqual(expected);
});
