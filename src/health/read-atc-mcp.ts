import { readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AtcMcpProcess, AtcMcpRead } from './types.ts';

// Linux counts start times in clock ticks of 1/100 s (USER_HZ is 100 on every Linux build we run on).
const TICK_MS = 10;
const SCOPE = /atc-daemon-session-[0-9a-f]{8}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f]{8}\.scope/;

// Every `atc mcp` process under procRoot, plus the atc binary's modification time.
// Start time is exact: /proc/<pid>/stat field 22 (ticks since boot) plus btime from /proc/stat.
// A process that exits mid-scan is skipped; any other failure is returned as the error string.
export function readAtcMcp(procRoot = '/proc', binaryPath: string | undefined = Bun.which('atc') ?? undefined): AtcMcpRead {
  if (!binaryPath) return 'no atc on PATH';
  try {
    const binary = { path: binaryPath, mtimeMs: statSync(binaryPath).mtimeMs };
    const btime = Number(/^btime (\d+)$/m.exec(readFileSync(join(procRoot, 'stat'), 'utf8'))?.[1]);
    if (!Number.isFinite(btime)) return `no btime in ${join(procRoot, 'stat')}`;
    const processes: AtcMcpProcess[] = [];
    for (const entry of readdirSync(procRoot)) {
      if (!/^\d+$/.test(entry)) continue;
      const found = readProcess(join(procRoot, entry), Number(entry), btime);
      if (found) processes.push(found);
    }
    return { processes, binary };
  } catch (e) {
    return String((e as Error).message ?? e);
  }
}

function readProcess(dir: string, pid: number, btime: number): AtcMcpProcess | null {
  try {
    const argv = readFileSync(join(dir, 'cmdline'), 'utf8').split('\0');
    if (basename(argv[0] ?? '') !== 'atc' || argv[1] !== 'mcp') return null;
    const stat = readFileSync(join(dir, 'stat'), 'utf8');
    // comm (field 2) may hold spaces and parens, so count fields from the last ')'; field 3 is index 0.
    const ticks = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
    const exe = readlinkSync(join(dir, 'exe'));
    const sessionId = SCOPE.exec(readFileSync(join(dir, 'cgroup'), 'utf8'))?.[1] ?? null;
    return { pid, sessionId, startedAtMs: btime * 1000 + ticks * TICK_MS, exe };
  } catch {
    return null; // the process exited mid-scan
  }
}
