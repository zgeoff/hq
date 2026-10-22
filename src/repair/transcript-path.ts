import { existsSync, readdirSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { getProjectsDir } from './get-projects-dir.ts';

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function transcriptPath(cwd: string, agentSessionID: string): string {
  if (!SESSION_ID.test(agentSessionID)) throw new HqError('bad_args', `"${agentSessionID}" is not a Claude session id`);
  const direct = `${getProjectsDir()}/${formatProjectDir(cwd)}/${agentSessionID}.jsonl`;
  if (existsSync(direct) || !existsSync(getProjectsDir())) {
    return direct;
  }
  return findTranscript(agentSessionID, direct);
}

// One '-' per UTF-16 code unit, as Claude Code writes it: an astral character becomes two.
function formatProjectDir(cwd: string): string {
  let out = '';
  for (let index = 0; index < cwd.length; index += 1) {
    const unit = cwd.charAt(index);
    out += isAsciiAlphanumeric(unit) ? unit : '-';
  }
  return out;
}

// Claude keeps a session's transcript at ~/.claude/projects/<cwd, each non-alphanumeric as '-'>/<id>.jsonl.
// A long cwd gets a shortened folder name, so when that path is missing, hq looks for the one
// project folder that holds <id>.jsonl.
function isAsciiAlphanumeric(unit: string): boolean {
  return (unit >= 'a' && unit <= 'z') || (unit >= 'A' && unit <= 'Z') || (unit >= '0' && unit <= '9');
}

function findTranscript(agentSessionID: string, direct: string): string {
  const hits = readdirSync(getProjectsDir()).filter((d) => existsSync(`${getProjectsDir()}/${d}/${agentSessionID}.jsonl`));
  if (hits.length > 1) throw new HqError('ambiguous_session', `${hits.length} project folders hold ${agentSessionID}.jsonl: ${hits.join(', ')}`);
  return hits.length > 0 ? `${getProjectsDir()}/${hits[0]}/${agentSessionID}.jsonl` : direct;
}
