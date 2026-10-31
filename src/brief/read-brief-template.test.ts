import { expect, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubBriefGH } from '../../test/build-stub-brief-gh.ts';
import { readBriefTemplate } from './read-brief-template.ts';

test('it gives the body of the first text fence of the file at the commit', async () => {
  const run = buildStubBriefGH({ commits: { main: buildMockSha(5) }, files: { 'agent-kit/kettle-brief.md': '# Kettle\n\n```text\nBoil the water.\n```\n' } }, []);

  await expect(readBriefTemplate(run, buildMockSha(5), 'agent-kit/kettle-brief.md')).resolves.toBe('Boil the water.');
});

test('it refuses a missing file with the file and the sha', () => {
  const run = buildStubBriefGH({ commits: { main: buildMockSha(5) }, files: {} }, []);

  expect(readBriefTemplate(run, buildMockSha(5), 'agent-kit/kettle-brief.md')).rejects.toMatchObject({
    code: 'not_found',
    message: `agent-kit/kettle-brief.md is missing at ${buildMockSha(5)}`,
  });
});

test('it refuses a file with no text fence', () => {
  const run = buildStubBriefGH({ commits: { main: buildMockSha(5) }, files: { 'agent-kit/kettle-brief.md': '# Kettle\n\nNo fence here.\n' } }, []);

  expect(readBriefTemplate(run, buildMockSha(5), 'agent-kit/kettle-brief.md')).rejects.toMatchObject({
    code: 'bad_state',
    message: `agent-kit/kettle-brief.md at ${buildMockSha(5)} has no text fence holding the prompt`,
  });
});
