import { HqError } from '../errors.ts';
import { formatTrimReport } from './format-trim-report.ts';
import { runStateTrim } from './run-state-trim.ts';
import type { StateTrimArgs } from './run-state-trim.ts';

interface StateCommandArgs extends Omit<StateTrimArgs, 'role'> {
  verb: string | undefined;
  rest: string[];
}

// hq state trim <role> [--dry-run]
export function runStateCommand(args: StateCommandArgs): { data: Record<string, unknown>; text: string } {
  if (args.verb !== 'trim') {
    throw new HqError('bad_args', `unknown command: hq state ${args.verb ?? ''}. Try hq state trim <role> [--dry-run]`);
  }
  const [role] = args.rest;
  if (role === undefined) {
    throw new HqError('bad_args', 'give the role whose state file to trim: hq state trim <role> [--dry-run]');
  }
  const report = runStateTrim({ ...args, role });
  return { data: { ...report }, text: formatTrimReport(report) };
}
