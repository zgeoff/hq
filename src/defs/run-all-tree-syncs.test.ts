import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { runAllTreeSyncs } from './run-all-tree-syncs.ts';

test('it syncs both trees in one call, and a refused tree does not stop the other', () => {
  const ctx = createTreeFixture(),
    hq = ctx.createHq(),
    tree = ctx.createPrivate();
  hq.writeCommit({ 'skills/intake/SKILL.md': 'hq change\n' });
  tree.writeCommit({ 'skills/intake/SKILL.md': 'private change\n' });
  tree.git('remote', 'set-url', 'origin', 'git@github.com:zgeoff/hq.git');
  {
    const results = runAllTreeSyncs(ctx.db, 'z-q');
    expect(results.map((result) => [result.tree, result.sync?.ok])).toStrictEqual([
      ['hq', true],
      ['private', false],
    ]);
    expect(results[1]?.sync?.line).toContain('not zgeoff/hq-private');
  }
  expect(readFileSync(`${hq.dir}/skills/intake/SKILL.md`, 'utf8')).toBe('hq change\n');
});
