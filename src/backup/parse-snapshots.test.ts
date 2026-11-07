import { expect, test } from 'bun:test';
import { parseSnapshots } from './parse-snapshots.ts';

test('#parseSnapshots reads a snapshot list', () => {
  const listing = JSON.stringify([{ short_id: 'ab12cd34', time: '2026-11-01T00:00:00Z', paths: ['/kettle'], hostname: 'hq' }]);

  expect(parseSnapshots(listing)).toStrictEqual([{ short_id: 'ab12cd34', time: '2026-11-01T00:00:00Z', paths: ['/kettle'] }]);
});

test.each([['not json'], ['{"short_id": "ab12cd34"}'], ['[{"short_id": "ab12cd34"}]']])('#parseSnapshots rejects the output %s', (output) => {
  expect(() => parseSnapshots(output)).toThrow(/restic snapshots did not print a snapshot list/u);
});

test('#parseSnapshots throws restic_bad_output for output that is not a snapshot list', () => {
  const outcome = Promise.try(() => parseSnapshots('nope'));

  expect(outcome).rejects.toMatchObject({ code: 'restic_bad_output' });
});
