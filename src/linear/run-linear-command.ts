import { readdirSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { Flags } from '../cli.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { parseIssueFields } from './parse-issue-fields.ts';
import { pickStateNames } from './pick-state-names.ts';
import type { IssuesFilter } from './read-issue-pages.ts';
import { readIssuePages } from './read-issue-pages.ts';
import { readTeamStateNames } from './read-team-state-names.ts';
import type { LinearCall } from './types.ts';
import { writeIssuePages } from './write-issue-pages.ts';

// A page left by an earlier run would be read as part of this one.
const PAGE_FILE = /^issues-\d+\.json$/u;

export async function runLinearCommand(call: LinearCall, flags: Flags): Promise<Out> {
  const team = requireFlag(flags.team, 'team');
  const requested = requireFlag(flags.state, 'state')
    .split(',')
    .map((name) => name.trim());
  const out = requireFlag(flags.out, 'out');
  const fields = parseIssueFields(flags.fields);
  const updatedSince = parseUpdatedSince(flags['updated-since']);
  if (requested.some((name) => name === '')) {
    throw new HqError('bad_args', '--state is a comma-separated list of state names, with none empty');
  }
  if (!probeDirectory(out)) {
    throw new HqError('bad_args', `--out must be an existing directory: ${out}`);
  }
  if (readdirSync(out).some((entry) => PAGE_FILE.test(entry))) {
    throw new HqError('bad_args', `${out} already holds issue pages; use an empty directory`);
  }
  const known = await readTeamStateNames(call, team);
  const states = pickStateNames(requested, known, team);
  const filter: IssuesFilter = { team: { key: { eq: team } }, state: { name: { in: states } } };
  if (updatedSince !== undefined) {
    filter.updatedAt = { gte: updatedSince };
  }
  const pages = await readIssuePages(call, filter, fields);
  const files = writeIssuePages(out, pages);
  const issues = pages.reduce((total, page) => total + page.length, 0);
  return { data: { files, issues }, text: files.join('\n') };
}

function requireFlag(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new HqError('bad_args', `hq linear issues needs --${name}`);
  }
  return value;
}

// A time without an offset would be read in the local zone.
const updatedSinceSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

function parseUpdatedSince(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!updatedSinceSchema.safeParse(raw).success) {
    throw new HqError('bad_args', `--updated-since must be an ISO date-time with an offset or Z, or a date YYYY-MM-DD, not "${raw}"`);
  }
  return new Date(raw).toISOString();
}

function probeDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
