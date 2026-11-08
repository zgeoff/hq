// A Claude Code session spawned in a folder nobody trusted stops at the trust dialog and hangs
// silently. Trust lives in ~/.claude.json under projects[<path>].hasTrustDialogAccepted; a trusted
// parent folder covers its children.
import { isRecord } from '@zgeoff/std';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getClaudeJson } from './get-claude-json.ts';
import type { Trust } from './types.ts';
import { toErrorMessage } from '../to-error-message.ts';

export function checkFolderTrust(cwd: string, file = getClaudeJson()): Trust {
  let projects: Record<string, unknown>;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    projects = isRecord(raw) && isRecord(raw['projects']) ? raw['projects'] : {};
  } catch (e) {
    return { trusted: false, why: `can't read ${file}: ${toErrorMessage(e).slice(0, 120)}` };
  }
  for (let d = resolve(cwd); ; d = dirname(d)) {
    const project = projects[d];
    if (Object.hasOwn(projects, d) && isRecord(project) && project['hasTrustDialogAccepted'] === true) {
      return { trusted: true, by: d };
    }
    if (dirname(d) === d) break;
  }
  return { trusted: false, why: `${cwd} is not trusted by Claude Code; open claude there once and answer its trust dialog` };
}
