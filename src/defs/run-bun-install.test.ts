import { expect, mock, test } from 'bun:test';
import type { Spawn } from './run-bun-install.ts';
import { runBunInstall } from './run-bun-install.ts';

test('it installs with the lockfile frozen and every lifecycle script off', () => {
  const spawn = mock<Spawn>(() => ({ exitCode: 0, stderr: Buffer.from('') }));

  expect(runBunInstall('/invented/hq-defs', spawn)).toStrictEqual({ code: 0, err: '' });
  expect(spawn.mock.calls).toStrictEqual([[['bun', 'install', '--frozen-lockfile', '--ignore-scripts'], { cwd: '/invented/hq-defs', timeout: 300_000 }]]);
});
