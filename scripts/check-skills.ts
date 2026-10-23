// CI: every `hq …` line in skills/ against hq --help (GEO-989). Exits 1 on any problem.
import { join } from 'node:path';
import { HELP } from '../src/help.ts';
import { checkSkills } from '../src/skillcheck/check-skills.ts';

const root = join(import.meta.dir, '..');
const { uses, problems } = checkSkills(root, HELP);
for (const p of problems) console.log(`${p.use.file}:${p.use.line}: ${p.why}\n  \`${p.use.text}\``);
console.log(`${uses} hq command line(s) in skills/; ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
