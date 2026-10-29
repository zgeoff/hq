import { iso } from '../clock/iso.ts';
import type { AtcMcpRead, Check } from './types.ts';

const DELETED = ' (deleted)';

// Pure: one failing check per atc mcp process older than the installed atc build, else one passing check.
// A read error is one failing check; the caller keeps the open atc-mcp problems open.
export function pickAtcMcpChecks(read: AtcMcpRead, nameOf: (sessionId: string) => string | null): Check[] {
  if (typeof read === 'string') {
    return [{ key: 'atc-mcp', ok: false, line: `can't read the atc mcp processes: ${read}` }];
  }
  const { processes, binary } = read;
  const stale = processes.filter((p) => p.startedAtMs < binary.mtimeMs || p.exe.endsWith(DELETED));
  if (stale.length === 0) {
    return [{ key: 'atc-mcp', ok: true, line: `atc mcp: every session's process runs the current atc build (${processes.length} processes)` }];
  }
  return stale.map((p) => {
    const built = `started before the atc build of ${iso(new Date(binary.mtimeMs))}; restart the session for the new tool list`;
    if (p.sessionId === null) {
      return { key: `atc-mcp:${p.pid}`, ok: false, line: `atc mcp (pid ${p.pid}) ${built}` };
    }
    const short = p.sessionId.slice(0, 8);
    const name = nameOf(p.sessionId);
    return { key: `atc-mcp:${p.sessionId}`, ok: false, line: `atc mcp for ${name === null ? `session ${short}` : `${name} (session ${short})`} ${built}` };
  });
}
