import { expect, test } from 'bun:test';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { readNoslopCheck } from './read-noslop-check.ts';

test("it takes the noslop App's run with the highest id, whatever order GitHub lists the runs in", async () => {
  const fake = buildFakeRunner({ noslopChecks: { code: 0, stdout: [JSON.stringify({ id: 9001, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'failure', title: '1 finding is open.', completedAt: '2026-10-14T01:00:00Z' }), JSON.stringify({ id: 9003, name: 'noslop', app: 'noslop-review', status: 'queued', conclusion: null, title: null, completedAt: null }), JSON.stringify({ id: 9002, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'success', title: 'No findings need attention.', completedAt: '2026-10-14T01:05:00Z' })].join('\n'), stderr: '' } });

  await expect(readNoslopCheck(fake.run, 'zgeoff/widgets', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).resolves.toStrictEqual({ found: true, status: 'queued', conclusion: null, title: null, completedAt: null });
});

test('it reads when the newest run completed', async () => {
  const fake = buildFakeRunner({ noslopChecks: { code: 0, stdout: [JSON.stringify({ id: 9001, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'failure', title: '1 finding is open.', completedAt: '2026-10-14T01:00:00Z' }), JSON.stringify({ id: 9002, name: 'noslop', app: 'noslop-review', status: 'completed', conclusion: 'success', title: 'No findings need attention.', completedAt: '2026-10-14T01:05:00Z' })].join('\n'), stderr: '' } });

  await expect(readNoslopCheck(fake.run, 'zgeoff/widgets', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).resolves.toStrictEqual({ found: true, status: 'completed', conclusion: 'success', title: 'No findings need attention.', completedAt: '2026-10-14T01:05:00Z' });
});

test('it reads the check runs of the commit it names', async () => {
  const fake = buildFakeRunner();

  await readNoslopCheck(fake.run, 'zgeoff/widgets', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

  expect(fake.lines()).toStrictEqual(['gh api repos/zgeoff/widgets/commits/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678/check-runs?check_name=noslop&filter=all&per_page=100 --paginate --jq .check_runs[] | {id, name, app: .app.slug, status, conclusion, title: .output.title, completedAt: .completed_at}']);
});

test('it reads no check from a line that is not a check run', async () => {
  const fake = buildFakeRunner({ noslopChecks: { code: 0, stdout: '{"id":"kettle"}\n', stderr: '' } });

  await expect(readNoslopCheck(fake.run, 'zgeoff/widgets', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).resolves.toStrictEqual({ found: false, reason: 'gh api repos/zgeoff/widgets/commits/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678/check-runs?check_name=noslop&filter=all&per_page=100 printed a line that is not a check run' });
});
