import { expect, test } from 'bun:test';
import { buildStubFileDiff } from './build-stub-file-diff.ts';

test('it prints a hunk of removed and added lines under the file header', () => {
  expect(buildStubFileDiff('AGENTS.md', { start: 3, removed: ['Boil.'], added: ['Steam.', 'Pour.'] })).toBe(['diff --git a/AGENTS.md b/AGENTS.md', '--- a/AGENTS.md', '+++ b/AGENTS.md', '@@ -3,1 +3,2 @@', '-Boil.', '+Steam.', '+Pour.', ''].join('\n'));
});
