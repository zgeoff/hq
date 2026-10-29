import { expect, test } from 'bun:test';
import { pickAtcMcpChecks } from './pick-atc-mcp-checks.ts';

const BUILT = Date.parse('2026-10-30T10:00:00Z');
const ID = '1a2b3c4d-1111-2222-3333-444455556666';

test('it fails a process that started before the atc build', () => {
  const read = { processes: [{ pid: 7, sessionId: ID, startedAtMs: BUILT - 1, exe: '/bin/atc' }], binary: { path: '/bin/atc', mtimeMs: BUILT } };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([
    { key: `atc-mcp:${ID}`, ok: false, line: 'atc mcp for session 1a2b3c4d started before the atc build of 2026-10-30T10:00:00Z; restart the session for the new tool list' },
  ]);
});

test('it fails a process whose exe was deleted although it started after the build', () => {
  const read = { processes: [{ pid: 7, sessionId: ID, startedAtMs: BUILT + 5, exe: '/bin/atc (deleted)' }], binary: { path: '/bin/atc', mtimeMs: BUILT } };

  expect(pickAtcMcpChecks(read, () => null).map((c) => [c.key, c.ok])).toStrictEqual([[`atc-mcp:${ID}`, false]]);
});

test('it passes with one line and the count when every process is current', () => {
  const read = {
    processes: [
      { pid: 7, sessionId: ID, startedAtMs: BUILT, exe: '/bin/atc' },
      { pid: 8, sessionId: null, startedAtMs: BUILT + 9, exe: '/bin/atc' },
    ],
    binary: { path: '/bin/atc', mtimeMs: BUILT },
  };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([{ key: 'atc-mcp', ok: true, line: "atc mcp: every session's process runs the current atc build (2 processes)" }]);
});

test('it fails with the read error when the read failed', () => {
  expect(pickAtcMcpChecks('no atc on PATH', () => null)).toStrictEqual([{ key: 'atc-mcp', ok: false, line: "can't read the atc mcp processes: no atc on PATH" }]);
});

test('it names the session by its fleet name when one is declared', () => {
  const read = { processes: [{ pid: 7, sessionId: ID, startedAtMs: BUILT - 1, exe: '/bin/atc' }], binary: { path: '/bin/atc', mtimeMs: BUILT } };

  expect(pickAtcMcpChecks(read, (id) => (id === ID ? 'z-kettle' : null))[0]?.line).toStartWith('atc mcp for z-kettle (session 1a2b3c4d) started before');
});

test('it keys a stale process without a session by its pid', () => {
  const read = { processes: [{ pid: 4242, sessionId: null, startedAtMs: BUILT - 1, exe: '/bin/atc' }], binary: { path: '/bin/atc', mtimeMs: BUILT } };

  expect(pickAtcMcpChecks(read, () => null)[0]?.key).toBe('atc-mcp:4242');
});
