// Claude Code's folder trust (z-stu, 2026-10-16): a session spawned in a folder nobody trusted
// stops at the trust dialog and hangs silently. Trust lives in ~/.claude.json under
// projects[<path>].hasTrustDialogAccepted; a trusted parent folder covers its children. hq only
// reads it: trusting a folder stays a human's answer.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getClaudeJson } from './get-claude-json.ts';
import type { Trust } from './types.ts';

export function checkFolderTrust(cwd: string, file = getClaudeJson()): Trust {
  let projects: Record<string, { hasTrustDialogAccepted?: unknown }>;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { projects?: unknown };
    projects = raw.projects && typeof raw.projects === 'object' ? (raw.projects as typeof projects) : {};
  } catch (e) {
    return { trusted: false, why: `can't read ${file}: ${String((e as Error).message ?? e).slice(0, 120)}` };
  }
  for (let d = resolve(cwd); ; d = dirname(d)) {
    if (Object.hasOwn(projects, d) && projects[d]?.hasTrustDialogAccepted === true) return { trusted: true, by: d };
    if (dirname(d) === d) break;
  }
  return { trusted: false, why: `${cwd} is not trusted by Claude Code; open claude there once and answer its trust dialog` };
}
