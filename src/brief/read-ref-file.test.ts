import { expect, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubProgramRunner } from '../../test/build-stub-program-runner.ts';
import { buildStubBriefGH } from '../../test/build-stub-brief-gh.ts';
import { readRefFile } from './read-ref-file.ts';

test('it gives the text of a file at the commit', async () => {
  const calls: string[] = [];
  const run = buildStubBriefGH({ commits: { main: buildMockSha(5) }, files: { 'agent-kit/kettle.md': 'boil it\n' } }, calls);

  await expect(readRefFile(run, buildMockSha(5), 'agent-kit/kettle.md')).resolves.toBe('boil it\n');
  expect(calls).toStrictEqual([`gh api repos/zgeoff/hq/contents/agent-kit/kettle.md?ref=${buildMockSha(5)} -H Accept: application/vnd.github.raw`]);
});

test('it gives null for a file the commit lacks', async () => {
  const run = buildStubBriefGH({ commits: { main: buildMockSha(5) }, files: {} }, []);

  await expect(readRefFile(run, buildMockSha(5), 'agent-kit/lid.md')).resolves.toBeNull();
});

test('it rejects a failure that is no 404, so a flaky read is not taken for a missing file', () => {
  const run = buildStubProgramRunner({ gh: { code: 1, stdout: '', stderr: 'gh: HTTP 502 bad gateway' } });

  expect(readRefFile(run, buildMockSha(5), 'agent-kit/kettle.md')).rejects.toMatchObject({ code: 'command_failed' });
});
