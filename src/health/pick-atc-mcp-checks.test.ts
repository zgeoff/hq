import { expect, test } from 'bun:test';
import { pickAtcMcpChecks } from './pick-atc-mcp-checks.ts';

test('it fails a process that started before the atc build', () => {
  const read = {
    processes: [{ pid: 7, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_793_354_399_999, exe: '/bin/atc' }],
    binary: { path: '/bin/atc', mtimeMs: 1_793_354_400_000 },
  };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([
    { key: 'atc-mcp:1a2b3c4d-1111-2222-3333-444455556666', ok: false, line: 'atc mcp for session 1a2b3c4d started before the atc build of 2026-10-30T10:00:00Z; restart the session for the new tool list' },
  ]);
});

test('it fails a process whose exe was deleted although it started after the build', () => {
  const read = {
    processes: [{ pid: 7, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_793_354_400_005, exe: '/bin/atc (deleted)' }],
    binary: { path: '/bin/atc', mtimeMs: 1_793_354_400_000 },
  };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([
    { key: 'atc-mcp:1a2b3c4d-1111-2222-3333-444455556666', ok: false, line: 'atc mcp for session 1a2b3c4d started before the atc build of 2026-10-30T10:00:00Z; restart the session for the new tool list' },
  ]);
});

test('it passes with one line and the count when every process is current', () => {
  const read = {
    processes: [
      { pid: 7, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_793_354_400_000, exe: '/bin/atc' },
      { pid: 8, sessionId: null, startedAtMs: 1_793_354_400_009, exe: '/bin/atc' },
    ],
    binary: { path: '/bin/atc', mtimeMs: 1_793_354_400_000 },
  };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([{ key: 'atc-mcp', ok: true, line: "atc mcp: every session's process runs the current atc build (2 processes)" }]);
});

test('it fails with the read error when the read failed', () => {
  expect(pickAtcMcpChecks('no atc on PATH', () => null)).toStrictEqual([{ key: 'atc-mcp', ok: false, line: "can't read the atc mcp processes: no atc on PATH" }]);
});

test('it names the session by its fleet name when one is declared', () => {
  const read = {
    processes: [{ pid: 7, sessionId: '1a2b3c4d-1111-2222-3333-444455556666', startedAtMs: 1_793_354_399_999, exe: '/bin/atc' }],
    binary: { path: '/bin/atc', mtimeMs: 1_793_354_400_000 },
  };

  expect(pickAtcMcpChecks(read, () => 'z-kettle')).toStrictEqual([
    {
      key: 'atc-mcp:1a2b3c4d-1111-2222-3333-444455556666',
      ok: false,
      line: 'atc mcp for z-kettle (session 1a2b3c4d) started before the atc build of 2026-10-30T10:00:00Z; restart the session for the new tool list',
    },
  ]);
});

test('it keys a stale process without a session by its pid', () => {
  const read = { processes: [{ pid: 4242, sessionId: null, startedAtMs: 1_793_354_399_999, exe: '/bin/atc' }], binary: { path: '/bin/atc', mtimeMs: 1_793_354_400_000 } };

  expect(pickAtcMcpChecks(read, () => null)).toStrictEqual([
    { key: 'atc-mcp:4242', ok: false, line: 'atc mcp (pid 4242) started before the atc build of 2026-10-30T10:00:00Z; restart the session for the new tool list' },
  ]);
});
