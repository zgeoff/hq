import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { classifyTestScope } from './classify-test-scope.ts';

export function readTestScope(base: string, cwd: string = process.cwd()): 'run' | 'skip' {
  if (base === '') {
    return 'run';
  }
  const result = spawnSync('git', ['diff', '--name-only', '--no-renames', '--merge-base', base], { cwd, encoding: 'utf8' });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git diff --merge-base ${base} failed (${result.status ?? result.signal}): ${result.stderr.trim()}`);
  }
  return classifyTestScope(result.stdout.split('\n').filter((line) => line !== ''));
}

if (import.meta.main) {
  const scope = readTestScope(process.env['TEST_BASE'] ?? '');
  const output = process.env['GITHUB_OUTPUT'];
  console.log(`tests: ${scope}`);
  if (output !== undefined && output !== '') {
    appendFileSync(output, `tests=${scope}\n`);
  }
}
