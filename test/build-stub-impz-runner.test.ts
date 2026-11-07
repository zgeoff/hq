import { expect, test } from 'bun:test';
import { buildStubImpzRunner } from './build-stub-impz-runner.ts';

test('it prints the info and the imp list as JSON, and refuses any other impz command', async () => {
  const run = buildStubImpzRunner({ info: { ramBudgetMib: 8192 }, imps: [{ name: 'kettle-1', state: 'running' }] });

  const results = await Promise.all([run(['impz', 'info', '--json']), run(['impz', 'ls', '--json']), run(['impz', 'wake', 'kettle-1'])]);

  expect(results).toStrictEqual([
    { code: 0, stdout: '{"ramBudgetMib":8192}', stderr: '' },
    { code: 0, stdout: '[{"name":"kettle-1","state":"running"}]', stderr: '' },
    { code: 2, stdout: '', stderr: 'impz: unknown command impz wake kettle-1' },
  ]);
});
