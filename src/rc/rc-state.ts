// Is Remote Control on for one atc session? (GEO-1102 v2)
// Claude Code keeps `replBridgePlaceholders` in its config file, one entry per process with a
// Remote Control bridge. hq reads that file and /proc, and nothing else: it never writes,
// renames or locks the config file. Any doubt answers 'unknown', and unknown means hq types nothing.
import { readFileSync } from 'node:fs';
import { getClaudeJson } from '../trust/get-claude-json.ts';
import { bootTime } from './boot-time.ts';
import { rcFromConfig } from './rc-from-config.ts';
import { scanProc } from './scan-proc.ts';
import type { RcSources, RcState } from './types.ts';

// Read-only: readFileSync on the config path, nothing else touches it.
const readConfig = (): string | null => {
  try {
    return readFileSync(getClaudeJson(), 'utf8');
  } catch {
    return null;
  }
};

export function rcState(sessionId: string, src: RcSources = {}): RcState {
  const found = (src.findPid ?? scanProc)(sessionId);
  if ('why' in found) return rcFromConfig(null, found, src.alive);
  return rcFromConfig((src.read ?? readConfig)(), found, src.alive, src.start, (src.now ?? Date.now)(), (src.boot ?? bootTime)());
}
