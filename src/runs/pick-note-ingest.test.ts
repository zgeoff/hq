import { expect, test } from 'bun:test';
import { pickNoteIngest } from './pick-note-ingest.ts';

test.each([
  { name: 'a session on no open run', session: null, stored: false, expected: 'unmatched' },
  { name: 'a note already stored', session: { design_pass: 0 }, stored: true, expected: 'duplicate' },
  { name: 'a note from a design pass', session: { design_pass: 1 }, stored: false, expected: 'store' },
  { name: 'a new note from a build session', session: { design_pass: 0 }, stored: false, expected: 'apply' },
] as const)('it picks $expected for $name', (row) => {
  expect(pickNoteIngest({ session: row.session, stored: row.stored })).toBe(row.expected);
});
