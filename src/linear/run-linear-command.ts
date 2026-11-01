import type { Flags } from '../cli.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { collectUnmappedAreas } from './collect-unmapped-areas.ts';
import { parseLinearIssuesFlags } from './parse-linear-issues-flags.ts';
import { pickStateNames } from './pick-state-names.ts';
import type { IssuesFilter } from './read-issue-pages.ts';
import { readIssuePages } from './read-issue-pages.ts';
import { readTeamLabels } from './read-team-labels.ts';
import { readTeamStateNames } from './read-team-state-names.ts';
import type { IssueFiles, LinearCommandDeps } from './types.ts';
import { writeIssuePages } from './write-issue-pages.ts';

// A page left by an earlier run would be read as part of this one.
const PAGE_FILE = /^issues-\d+\.json$/u;

export async function runLinearCommand(deps: LinearCommandDeps, verb: string | undefined, flags: Flags): Promise<Out> {
  if (verb === 'areas') {
    return await runLinearAreas(deps, flags);
  }
  const input = parseLinearIssuesFlags(flags);
  if (!probeDirectory(deps.files, input.out)) {
    throw new HqError('bad_args', `--out must be an existing directory: ${input.out}`);
  }
  if (deps.files.readdirSync(input.out).some((entry) => PAGE_FILE.test(entry))) {
    throw new HqError('bad_args', `${input.out} already holds issue pages; use an empty directory`);
  }
  const known = await readTeamStateNames(deps.call, input.team);
  const states = pickStateNames(input.states, known, input.team);
  const filter: IssuesFilter = { team: { key: { eq: input.team } }, state: { name: { in: states } } };
  if (input.updatedSince !== undefined) {
    filter.updatedAt = { gte: input.updatedSince };
  }
  const pages = await readIssuePages(deps.call, filter, input.fields);
  const files = writeIssuePages(deps.files, input.out, pages);
  const issues = pages.reduce((total, page) => total + page.length, 0);
  return { data: { files, issues }, text: files.join('\n') };
}

async function runLinearAreas(deps: LinearCommandDeps, flags: Flags): Promise<Out> {
  const team = flags.team;
  if (team === undefined || team === '') {
    throw new HqError('bad_args', 'hq linear areas needs --team');
  }
  const labels = await readTeamLabels(deps.call, team);
  const unmapped = collectUnmappedAreas(labels);
  if (unmapped.length > 0) {
    throw new HqError('bad_state', `${team} has area labels hq does not know: ${unmapped.join(', ')}. Add each to FOCUS_AREAS in src/focus/focus-areas.ts and its repo to src/brief/area-repos.ts, or add it to NOT_AREA_LABELS there if it names no area`, { unmapped });
  }
  return { data: { team, unmapped }, text: `every area label in ${team} names a repo hq knows` };
}

function probeDirectory(files: IssueFiles, path: string): boolean {
  try {
    return files.statSync(path).isDirectory();
  } catch {
    return false;
  }
}
