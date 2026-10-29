import { iso } from '../clock/iso.ts';
import type { AtcMcpRead, Check } from './types.ts';

const DELETED = ' (deleted)';

// /proc/stat btime is whole seconds, so a read start time can be up to 1 s early.
const START_SLACK_MS = 1000;

// Pure: one failing check per atc mcp process older than the installed atc build, else one passing check.
// A read error is one failing check; the caller keeps the open atc-mcp problems open.
export function pickAtcMcpChecks(read: AtcMcpRead, nameOf: (sessionID: string) => string | null): Check[] {
  if (typeof read === 'string') {
    return [{ key: 'atc-mcp', ok: false, line: `can't read the atc mcp processes: ${read}` }];
  }
  const built = iso(new Date(read.binary.mtimeMs));
  const stale = read.processes.flatMap((candidate) => {
    if (candidate.startedAtMs + START_SLACK_MS <= read.binary.mtimeMs) {
      return [{ candidate, why: `started before the atc build of ${built}` }];
    }
    return candidate.exe.endsWith(DELETED) ? [{ candidate, why: 'runs a replaced atc binary' }] : [];
  });
  if (stale.length === 0) {
    return [{ key: 'atc-mcp', ok: true, line: `atc mcp: every session's process runs the current atc build (${read.processes.length} processes)` }];
  }
  return stale.map((flagged) => {
    const candidate = flagged.candidate;
    const tail = `${flagged.why}; restart the session for the new tool list`;
    if (candidate.sessionID === null) {
      return { key: `atc-mcp:${candidate.pid}`, ok: false, line: `atc mcp (pid ${candidate.pid}) ${tail}` };
    }
    const short = candidate.sessionID.slice(0, 8);
    const name = nameOf(candidate.sessionID);
    return { key: `atc-mcp:${candidate.sessionID}`, ok: false, line: `atc mcp for ${name === null ? `session ${short}` : `${name} (session ${short})`} ${tail}` };
  });
}
