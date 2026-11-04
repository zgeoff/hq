import rulesTable from '../../lanes.json';
import type { Flags } from '../cli.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { readAreaLabels } from '../focus/read-area-labels.ts';
import { writeAreaLabels } from '../focus/write-area-labels.ts';
import { collectAreaNames } from './collect-area-names.ts';
import { parseLinearIssuesFlags } from './parse-linear-issues-flags.ts';
import { pickStateNames } from './pick-state-names.ts';
import { planLinearAreas } from './plan-linear-areas.ts';
import type { IssuesFilter } from './read-issue-pages.ts';
import { readIssuePages } from './read-issue-pages.ts';
import { readRepoExists } from './read-repo-exists.ts';
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
  const names = collectAreaNames(labels);
  const repoExists = await readRepoExists(deps.run, names, readAreaLabels(deps.db).repoExists);
  const plan = planLinearAreas(team, rulesTable.team, names, repoExists, iso(now()));
  if (plan.store !== null) {
    writeAreaLabels(deps.db, plan.store);
  }
  const missing = plan.missing;
  if (missing.length > 0) {
    throw new HqError('bad_state', `${team} has area labels whose zgeoff repo does not exist: ${missing.join(', ')}. Create the repo, or take the label off the issues that carry it`, { missing });
  }
  return { data: { team, areas: names, missing }, text: `every area label in ${team} names a zgeoff repo that exists` };
}

function probeDirectory(files: IssueFiles, path: string): boolean {
  try {
    return files.statSync(path).isDirectory();
  } catch {
    return false;
  }
}
