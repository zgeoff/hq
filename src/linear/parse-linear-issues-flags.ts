import { z } from 'zod';
import type { Flags } from '../cli.ts';
import { HqError } from '../errors.ts';
import type { IssueField } from './parse-issue-fields.ts';
import { parseIssueFields } from './parse-issue-fields.ts';

export interface LinearIssuesInput {
  team: string;
  states: string[];
  out: string;
  fields: IssueField[];
  updatedSince: string | undefined;
}

export function parseLinearIssuesFlags(flags: Flags): LinearIssuesInput {
  const team = requireFlag(flags.team, 'team');
  const states = requireFlag(flags.state, 'state')
    .split(',')
    .map((name) => name.trim());
  const out = requireFlag(flags.out, 'out');
  const fields = parseIssueFields(flags.fields);
  const updatedSince = parseUpdatedSince(flags['updated-since']);
  if (states.some((name) => name === '')) {
    throw new HqError('bad_args', '--state is a comma-separated list of state names, with none empty');
  }
  return { team, states, out, fields, updatedSince };
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
