import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRoundStem } from './build-round-stem.ts';
import { readOpenRounds } from './read-open-rounds.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-open-rounds-'));
  const sleeper = Bun.spawn(['sleep', '30']);

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(() => sleeper.kill());

  return { directory, pid: sleeper.pid };
}

test('it tells kettle1 #2 from kettle #12 by the worktree names their rounds use', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, `${buildRoundStem('kettle1', 2)}-noslop-${ctx.pid}`));
  mkdirSync(join(ctx.directory, `${buildRoundStem('kettle', 12)}-noslop-${ctx.pid}`));

  expect(readOpenRounds(ctx.directory).map((round) => round.ref).toSorted()).toStrictEqual(['kettle#12', 'kettle1#2']);
});

test('it counts a round under the old worktree name without guessing its repo and PR', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.directory, `kettle12-noslop-${ctx.pid}`));

  expect(readOpenRounds(ctx.directory)).toStrictEqual([{ ref: 'kettle12 (old worktree name)', pid: ctx.pid, startedAt: expect.any(String) }]);
});
