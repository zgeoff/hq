import { expect, test } from 'bun:test';
import { HEALTH_DEFAULTS } from './health-defaults.ts';
import { runChecks } from './run-checks.ts';

const probe = (atcMcp: () => Promise<string>) => ({
  run: async () => ({ code: 1, stdout: '', stderr: '' }),
  readFile: async () => '',
  atcAnswers: async () => null,
  home: '/',
  atcMcp,
});

test('it adds the atc mcp check and marks it unknown when the read fails', async () => {
  const r = await runChecks(probe(async () => 'no atc on PATH'), HEALTH_DEFAULTS, {}, new Date());

  expect(r.checks).toContainEqual({ key: 'atc-mcp', ok: false, line: "can't read the atc mcp processes: no atc on PATH" });
  expect(r.unknown).toContain('atc-mcp');
});

test('it adds a failing atc mcp check for a stale process, named by the fleet name', async () => {
  const id = '1a2b3c4d-1111-2222-3333-444455556666';
  const p = { ...probe(async () => 'x'), atcMcp: async () => ({ processes: [{ pid: 3, sessionId: id, startedAtMs: 1, exe: '/b/atc' }], binary: { path: '/b/atc', mtimeMs: 2 } }), sessionName: () => 'z-kettle' };

  const r = await runChecks(p, HEALTH_DEFAULTS, {}, new Date());

  expect(r.checks.map((c) => [c.key, c.ok])).toContainEqual([`atc-mcp:${id}`, false]);
  expect(r.unknown).not.toContain('atc-mcp');
});
