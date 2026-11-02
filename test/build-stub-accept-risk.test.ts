import { expect, test } from 'bun:test';
import { buildAcceptRiskScenario, buildReplyDrivenNoslop } from './build-stub-accept-risk.ts';

test('it builds a scenario whose issue body answers the finding on two id-led lines', () => {
  const scenario = buildAcceptRiskScenario();

  expect(scenario.issueBody.split('\n\n')[0]?.split('\n')).toStrictEqual(['aaaaaaaaaaaaaaaa accepted-risk The lid is cosmetic.', 'aaaaaaaaaaaaaaaa accepted-risk The lid is cosmetic.']);
});

test('it reads the finding open until an accepted-risk reply is posted, and fails the check until noslop check runs', async () => {
  const noslop = buildReplyDrivenNoslop(buildAcceptRiskScenario().thread);
  const findings = ['bun', '--config=noslop/bunfig.toml', 'noslop/cli.ts', 'findings', '--pr', '7'];
  const checkRuns = ['gh', 'api', 'repos/zgeoff/widgets/commits/abc/check-runs?check_name=noslop'];

  const before = [(await noslop.run(findings)).stdout, (await noslop.run(checkRuns)).stdout];
  await noslop.run(['gh', 'api', '-X', 'POST', 'repos/zgeoff/widgets/pulls/7/comments/501/replies', '-f', 'body=aaaaaaaaaaaaaaaa accepted-risk fine']);
  const replied = [(await noslop.run(findings)).stdout, (await noslop.run(checkRuns)).stdout];
  await noslop.run(['bun', '--config=noslop/bunfig.toml', 'noslop/cli.ts', 'check', '--pr', '7']);
  const checked = (await noslop.run(checkRuns)).stdout;

  expect([before[0]?.includes('"open"'), before[1]?.includes('"failure"')]).toStrictEqual([true, true]);
  expect([replied[0]?.includes('"accepted-risk"'), replied[1]?.includes('"failure"')]).toStrictEqual([true, true]);
  expect(checked.includes('"success"')).toBe(true);
});
