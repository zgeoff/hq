import { readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AtcMcpProcess, AtcMcpRead } from './types.ts';

// Every `atc mcp` process under procRoot, plus the atc binary's modification time.
// Start time is exact: /proc/<pid>/stat field 22 (ticks since boot) plus btime from /proc/stat.
// A process that exits mid-scan is skipped; any other failure is returned as the error string.
export function readAtcMcp(procRoot = '/proc', binaryPath: string | undefined = Bun.which('atc') ?? undefined): AtcMcpRead {
  if (!binaryPath) {
    return 'no atc on PATH';
  }
  try {
    const binary = { path: binaryPath, mtimeMs: statSync(binaryPath).mtimeMs };
    const statFile = join(procRoot, 'stat');
    const btime = Number(/^btime (?<seconds>\d+)$/mu.exec(readFileSync(statFile, 'utf8'))?.groups?.['seconds']);
    if (!Number.isFinite(btime)) {
      return `no btime in ${statFile}`;
    }
    const processes: AtcMcpProcess[] = [];
    for (const entry of readdirSync(procRoot)) {
      if (!/^\d+$/u.test(entry)) {
        continue;
      }
      const found = readProcess(join(procRoot, entry), Number(entry), btime);
      if (found) {
        processes.push(found);
      }
    }
    return { processes, binary };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// Linux counts start times in clock ticks of 1/100 s (USER_HZ is 100 on every Linux build we run on).
const TICK_MS = 10;
const SCOPE = /atc-daemon-session-[0-9a-f]{8}-(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f]{8}\.scope/u;

function readProcess(directory: string, pid: number, btime: number): AtcMcpProcess | null {
  try {
    const argv = readFileSync(join(directory, 'cmdline'), 'utf8').split('\0');
    if (basename(argv[0] ?? '') !== 'atc' || argv[1] !== 'mcp') {
      return null;
    }
    const stat = readFileSync(join(directory, 'stat'), 'utf8');

    // comm (field 2) may hold spaces and parens, so count fields from the last ')'; field 3 is index 0.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const exe = readlinkSync(join(directory, 'exe'));
    const cgroup = readFileSync(join(directory, 'cgroup'), 'utf8');
    const sessionId = SCOPE.exec(cgroup)?.groups?.['id'] ?? null;
    return { pid, sessionId, startedAtMs: btime * 1000 + Number(fields[19]) * TICK_MS, exe };
  } catch {
    // the process exited mid-scan
    return null;
  }
}
