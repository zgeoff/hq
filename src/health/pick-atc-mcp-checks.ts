import { iso } from '../clock/iso.ts';
import type { AtcMcpRead, Check } from './types.ts';

const DELETED = ' (deleted)';

// Pure: one failing check per atc mcp process older than the installed atc build, else one passing check.
// A read error is one failing check; the caller keeps the open atc-mcp problems open.
export function pickAtcMcpChecks(read: AtcMcpRead, nameOf: (sessionId: string) => string | null): Check[] {
  if (typeof read === 'string') {
    return [{ key: 'atc-mcp', ok: false, line: `can't read the atc mcp processes: ${read}` }];
  }
  const stale = read.processes.filter((candidate) => candidate.startedAtMs < read.binary.mtimeMs || candidate.exe.endsWith(DELETED));
  if (stale.length === 0) {
    return [{ key: 'atc-mcp', ok: true, line: `atc mcp: every session's process runs the current atc build (${read.processes.length} processes)` }];
  }
  return stale.map((candidate) => {
    const built = `started before the atc build of ${iso(new Date(read.binary.mtimeMs))}; restart the session for the new tool list`;
    if (candidate.sessionId === null) {
      return { key: `atc-mcp:${candidate.pid}`, ok: false, line: `atc mcp (pid ${candidate.pid}) ${built}` };
    }
    const short = candidate.sessionId.slice(0, 8);
    const name = nameOf(candidate.sessionId);
    return { key: `atc-mcp:${candidate.sessionId}`, ok: false, line: `atc mcp for ${name === null ? `session ${short}` : `${name} (session ${short})`} ${built}` };
  });
}
