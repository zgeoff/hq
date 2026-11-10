import { expect, test } from 'bun:test';
import { formatProbeNote } from './format-probe-note.ts';

test.each([
  { name: 'a probe start', probeStart: '2026-10-16T08:38:00Z', expected: 'probe from 16 Oct 08:38Z' },
  { name: 'no probe start', probeStart: null, expected: '' },
])('it formats $name', (row) => {
  expect(formatProbeNote(row.probeStart)).toBe(row.expected);
});
