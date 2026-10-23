import { expect, test } from 'bun:test';
import { buildStubReleaseGH } from './build-stub-release-gh.ts';

test('it answers the release list of a repo it holds, and records the call', async () => {
  const calls: string[] = [];
  const run = buildStubReleaseGH({ 'kettle-co/kettle': [{ tag_name: 'v1.2.0', draft: false, prerelease: false, published_at: '2026-10-15T00:00:00Z' }] }, calls);

  const answer = await run(['gh', 'api', 'repos/kettle-co/kettle/releases?per_page=30', '--jq', '[.[] | {tag_name, draft, prerelease, published_at}]'], {});

  expect(answer).toStrictEqual({ code: 0, stdout: '[{"tag_name":"v1.2.0","draft":false,"prerelease":false,"published_at":"2026-10-15T00:00:00Z"}]', stderr: '' });
  expect(calls).toStrictEqual(['gh api repos/kettle-co/kettle/releases?per_page=30 --jq [.[] | {tag_name, draft, prerelease, published_at}]']);
});

test("it answers gh's 404 for a repo it does not hold", async () => {
  const run = buildStubReleaseGH({}, []);

  const answer = await run(['gh', 'api', 'repos/kettle-co/teapot/releases?per_page=30', '--jq', '[.[] | {tag_name, draft, prerelease, published_at}]'], {});

  expect(answer).toStrictEqual({ code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' });
});

test('it fails any other command', async () => {
  const run = buildStubReleaseGH({}, []);

  const answer = await run(['gh', 'pr', 'view', '4', '-R', 'kettle-co/kettle', '--json', 'state'], {});

  expect(answer).toStrictEqual({ code: 1, stdout: '', stderr: 'unexpected gh pr view 4 -R kettle-co/kettle --json state' });
});
