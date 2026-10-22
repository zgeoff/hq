// GEO-989: every `hq …` line a skill writes must still be a command and flags hq's help names,
// so a renamed or dropped flag fails hq's CI instead of the z- sessions that day. The help text
// is the contract: a form is `hq <top> [<verb>] …`, and its flags are the --words in that form.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check } from './check.ts';
import { parseHelp } from './parse-help.ts';
import { skillFiles } from './skill-files.ts';
import type { Problem } from './types.ts';
import { usesIn } from './uses-in.ts';

export function checkSkills(root: string, help: string): { uses: number; problems: Problem[] } {
  const forms = parseHelp(help);
  const uses = skillFiles(root).flatMap((f) => usesIn(f, readFileSync(join(root, f), 'utf8')));
  return { uses: uses.length, problems: check(forms, uses) };
}
