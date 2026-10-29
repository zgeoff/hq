import { isAtcMcpCommand } from './is-atc-mcp-command.ts';
import type { AtcMcpProcess } from './types.ts';

interface AtcMcpProcessText {
  pid: number;
  cmdline: string;
  stat: string;
  exe: string;
  cgroup: string;

  // boot time in whole seconds, from /proc/stat
  btime: number;
}

// Linux counts start times in clock ticks of 1/100 s (USER_HZ is 100 on every Linux build we run on).
const TICK_MS = 10;
const SCOPE = /atc-daemon-session-[0-9a-f]{8}-(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-[0-9a-f]{8}\.scope/u;

// null: not an atc mcp process; 'no start time': the stat text has no field 22.
export function parseAtcMcpProcess(text: AtcMcpProcessText): AtcMcpProcess | 'no start time' | null {
  if (!isAtcMcpCommand(text.cmdline)) {
    return null;
  }

  // comm (field 2) may hold spaces and parens, so count fields from the last ')'; field 3 is index 0.
  const fields = text.stat.slice(text.stat.lastIndexOf(')') + 2).split(' ');
  const ticks = Number(fields[19]);
  if (!Number.isFinite(ticks)) {
    return 'no start time';
  }
  const sessionId = SCOPE.exec(text.cgroup)?.groups?.['id'] ?? null;
  return { pid: text.pid, sessionId, startedAtMs: text.btime * 1000 + ticks * TICK_MS, exe: text.exe };
}
