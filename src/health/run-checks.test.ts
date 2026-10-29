import { expect, test } from 'bun:test';
import { HEALTH_DEFAULTS } from './health-defaults.ts';
import { runChecks } from './run-checks.ts';
import type { AtcMcpRead, Probe } from './types.ts';

// A probe whose every command fails and whose atc mcp read is whatever the test passes in.
function setupTest(atcMcp: AtcMcpRead, sessionName: (sessionId: string) => string | null): Probe {
  return {
    run: () => Promise.resolve({ code: 1, stdout: '', stderr: '' }),
    readFile: () => Promise.resolve(''),
    atcAnswers: () => Promise.resolve(null),
    home: '/',
    atcMcp: () => Promise.resolve(atcMcp),
    sessionName,
  };
}

test('it adds the atc mcp check and marks it unknown when the read fails', async () => {
  const result = await runChecks(setupTest('no atc on PATH', () => null), HEALTH_DEFAULTS, {}, new Date());

  expect(result.checks).toContainEqual({ key: 'atc-mcp', ok: false, line: "can't read the atc mcp processes: no atc on PATH" });
  expect(result.unknown).toContain('atc-mcp');
});

test('it adds a failing atc mcp check for a stale process, named by the fleet name', async () => {
  const read = {
    processes: [{ pid: 3, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1, exe: '/b/atc' }],
    binary: { path: '/b/atc', mtimeMs: 2 },
  };

  const result = await runChecks(setupTest(read, () => 'z-kettle'), HEALTH_DEFAULTS, {}, new Date());

  expect(result.checks).toContainEqual({
    key: 'atc-mcp:1a2b3c4d-1111-2222-3333-444455556666',
    ok: false,
    line: 'atc mcp for z-kettle (session 1a2b3c4d) started before the atc build of 1970-01-01T00:00:00Z; restart the session for the new tool list',
  });
  expect(result.unknown).not.toContain('atc-mcp');
});
