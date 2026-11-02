import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMANDS } from '../commands.ts';
import { check } from './check.ts';
import { findKnownVerbs } from './find-known-verbs.ts';
import { parseHelp } from './parse-help.ts';
import { skillFiles } from './skill-files.ts';
import type { Problem } from './types.ts';
import { usesIn } from './uses-in.ts';

export function checkSkills(root: string, help: string): { uses: number; problems: Problem[] } {
  const forms = parseHelp(help, (top) => findKnownVerbs(COMMANDS, top));
  const uses = skillFiles(root).flatMap((f) => usesIn(f, readFileSync(join(root, f), 'utf8')));
  return { uses: uses.length, problems: check(forms, uses) };
}
