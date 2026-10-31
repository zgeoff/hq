import { expect, test } from 'bun:test';

// capacity.sh's golden cases run in a shell of their own; this puts them in the suite.
test('capacity.sh passes its golden cases', () => {
  const run = Bun.spawnSync(['sh', `${import.meta.dir}/capacity.test.sh`]);
  const output = `${run.stdout.toString()}${run.stderr.toString()}`;

  expect(output).not.toContain('FAIL');
  expect(run.exitCode).toBe(0);
});
