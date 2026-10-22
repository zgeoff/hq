import type { Flags } from '../cli.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { parseLinearIssuesFlags } from './parse-linear-issues-flags.ts';
import { pickStateNames } from './pick-state-names.ts';
import type { IssuesFilter } from './read-issue-pages.ts';
import { readIssuePages } from './read-issue-pages.ts';
import { readTeamStateNames } from './read-team-state-names.ts';
import type { IssueFiles, LinearCommandDeps } from './types.ts';
import { writeIssuePages } from './write-issue-pages.ts';

// A page left by an earlier run would be read as part of this one.
const PAGE_FILE = /^issues-\d+\.json$/u;

export async function runLinearCommand(deps: LinearCommandDeps, flags: Flags): Promise<Out> {
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

function probeDirectory(files: IssueFiles, path: string): boolean {
  try {
    return files.statSync(path).isDirectory();
  } catch {
    return false;
  }
}
