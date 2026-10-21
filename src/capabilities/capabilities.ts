// `hq capabilities`: what this hq can do, as data. A session checks it at start: `--require X.Y.Z`
// fails when the installed hq is older than the version the session needs. It never opens the db.
import type { Out } from '../commands.ts';
import { COMMANDS } from '../commands.ts';
import { HqError } from '../errors.ts';
import { rolesByName } from '../roles/roles-by-name.ts';
import { ASK_TRANSITIONS } from '../transitions/ask-transitions.ts';
import { PR_TRANSITIONS } from '../transitions/pr-transitions.ts';
import { RUN_TRANSITIONS } from '../transitions/run-transitions.ts';
import { compareSemver } from './compare-semver.ts';
import { parseSemver } from './parse-semver.ts';
import { SHAPES } from './shapes.ts';

export function capabilities(version: string, schema: number, require?: string): Out {
  if (require !== undefined) {
    if (!parseSemver(require)) {
      throw new HqError('bad_args', `--require must be a version like 1.2.3, not "${require}"`);
    }
    if (compareSemver(version, require) < 0) throw new HqError('too_old', `hq ${version} is older than ${require}: run bun run install-bin in ~/projects/hq`);
  }
  const commands = COMMANDS.map((c) => ({ nouns: c.nouns, verbs: c.verbs, bare: c.bare, usage: c.usage, summary: c.summary, section: c.section, readOnly: c.readOnly }));
  const transitions = { ask: ASK_TRANSITIONS, run: RUN_TRANSITIONS, pr: PR_TRANSITIONS };
  const readOnly = commands.filter((c) => c.readOnly).length;
  const text = [`hq ${version} (schema v${schema})`, `${commands.length} commands (${readOnly} read-only)`, `JSON shapes: ${Object.keys(SHAPES).join(', ')}`].join('\n');
  return { data: { version, schema, commands, transitions, roles: rolesByName(), shapes: SHAPES }, text };
}
