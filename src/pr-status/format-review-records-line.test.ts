import { expect, test } from 'bun:test';
import { formatReviewRecordsLine } from './format-review-records-line.ts';

test('it lists every file of a mechanical approval, four included', () => {
  const files = ['AGENTS.md', 'skills/kettle/SKILL.md', 'skills/teapot/SKILL.md', 'skills/cosy/SKILL.md'];

  expect(formatReviewRecordsLine({ mechanical: { files, lines: 4 }, exemption: null })).toBe('z-review: mechanical edits proved by hq (4 lines in AGENTS.md, skills/kettle/SKILL.md, skills/teapot/SKILL.md, skills/cosy/SKILL.md)');
});

test('it lists every file of an exemption, four included', () => {
  const files = ['AGENTS.md', 'skills/kettle/SKILL.md', 'skills/teapot/SKILL.md', 'skills/cosy/SKILL.md'];

  expect(formatReviewRecordsLine({ mechanical: null, exemption: { rule: 'repo-sync', note: 'Synced from the tools tag.', files } })).toBe(
    'z-review: exempt under the repo-sync rule, not proved by hq: Synced from the tools tag. (held files: AGENTS.md, skills/kettle/SKILL.md, skills/teapot/SKILL.md, skills/cosy/SKILL.md)',
  );
});

test('it gives no line when z-review recorded nothing', () => {
  expect(formatReviewRecordsLine({ mechanical: null, exemption: null })).toBeNull();
});
