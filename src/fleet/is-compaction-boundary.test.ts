import { expect, test } from 'bun:test';
import { isCompactionBoundary } from './is-compaction-boundary.ts';

test.each([
  { line: '{"type":"system","subtype":"compact_boundary","content":"Conversation compacted"}', boundary: true },
  { line: '{"type":"user","message":{"content":"mention \\"compact_boundary\\" in text"}}', boundary: false },
  { line: '{"type":"system","subtype":"informational"}', boundary: false },
  { line: '{"type":"system","subtype":"compact_boundary"', boundary: false },
])('a transcript line is a compaction only as a system compact_boundary entry: $line', (row) => {
  expect(isCompactionBoundary(row.line)).toBe(row.boundary);
});
