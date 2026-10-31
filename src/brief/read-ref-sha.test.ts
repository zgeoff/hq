import { expect, test } from 'bun:test';
import { buildMockSha } from '../../test/build-mock-sha.ts';
import { buildStubBriefGH } from '../../test/build-stub-brief-gh.ts';
import { readRefSHA } from './read-ref-sha.ts';

test('it gives the full sha the ref points at', async () => {
  const run = buildStubBriefGH({ commits: { 'refactor/kettle': buildMockSha(5) }, files: {} }, []);

  await expect(readRefSHA(run, 'refactor/kettle')).resolves.toBe(buildMockSha(5));
});

test('it rejects a ref the repo does not hold, with gh text', () => {
  const run = buildStubBriefGH({ commits: {}, files: {} }, []);

  expect(readRefSHA(run, 'gone')).rejects.toMatchObject({ code: 'command_failed', message: 'could not resolve --ref gone in zgeoff/hq: gh: Not Found (HTTP 404)' });
});

test('it rejects an answer that is no full sha', () => {
  const run = buildStubBriefGH({ commits: { main: 'abc123' }, files: {} }, []);

  expect(readRefSHA(run, 'main')).rejects.toMatchObject({ code: 'command_failed' });
});
