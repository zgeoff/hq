import { accessSync, constants, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatKilobytes } from '../state/format-kilobytes.ts';
import { getStateLimit } from '../state/get-state-limit.ts';
import { getStateOwner } from '../state/get-state-owner.ts';
import type { Check } from './types.ts';

// One failing check per role state file over its limit, else one passing check. Only <role>.md for
// the given roles: the folder also holds archives and notes. A read error is one failing check
// keyed 'state-size', which the caller treats as unknown.
export function readStateSizeChecks(directory: string, roles: string[]): Check[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch (error) {
    return [unreadable(`${directory}: ${errorCode(error)}`)];
  }
  const over: Check[] = [];
  let seen = 0;
  for (const role of roles) {
    const file = `${role}.md`;
    if (!names.includes(file)) {
      continue;
    }
    let size: number;
    try {
      // statSync reads only metadata, so a file that cannot be opened for reading needs its own check
      accessSync(join(directory, file), constants.R_OK);
      size = statSync(join(directory, file)).size;
    } catch (error) {
      return [unreadable(`${join(directory, file)}: ${errorCode(error)}`)];
    }
    seen++;
    const limit = getStateLimit(role);
    if (size > limit) {
      over.push({
        key: `state-size:${file}`,
        ok: false,
        line: `state file ${file} is ${formatKilobytes(size)}, over its ${limit / 1024} KB limit`,
        owner: { session: getStateOwner(role), ask: `trim it with \`hq state trim ${role}\`, or move old entries to your archive, then check that \`hq health\` is clear` },
      });
    }
  }
  if (over.length > 0) {
    return over;
  }
  return [{ key: 'state-size', ok: true, line: `state files: all ${seen} under their limits` }];
}

function unreadable(where: string): Check {
  return { key: 'state-size', ok: false, line: `can't read the state files (${where})` };
}

function errorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}
