import { appendFileSync, constants, copyFileSync, existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { buildTrimPlan } from './build-trim-plan.ts';
import { getStateLimit } from './get-state-limit.ts';
import type { TrimReport } from './types.ts';

export interface StateTrimArgs {
  directory: string;
  roles: string[];
  role: string;
  dryRun: boolean;
  at: Date;
  readText: (path: string) => string;
}

// Move the oldest "## Log" entries of <role>.md to this month's archive until the file fits its limit.
// Order: backup, archive append, then an atomic replace; no backup, no write.
export function runStateTrim(args: StateTrimArgs): TrimReport {
  const directory = args.directory;
  const role = args.role;
  if (!args.roles.includes(role)) {
    throw new HqError('unknown_role', `${role} is not a fleet role (${args.roles.join(', ')}), so it has no state file to trim`);
  }
  const file = join(directory, `${role}.md`);
  if (!existsSync(file)) {
    throw new HqError('no_state_file', `${file} does not exist`);
  }
  const text = args.readText(file);
  const limitBytes = getStateLimit(role);
  const plan = buildTrimPlan(text, limitBytes);
  if (plan.kind === 'no-log') {
    throw new HqError('no_log_section', `${role}.md has no "## Log" section, so hq state trim cannot trim it; trim it by hand`);
  }
  const stamp = iso(args.at).replaceAll(/[-:]/gu, '');
  const archive = join(directory, `${role}-archive-${iso(args.at).slice(0, 7)}.md`);
  const backup = join(directory, `${role}.md.bak-${stamp}`);
  const report: TrimReport = {
    role,
    file,
    dryRun: args.dryRun,
    written: false,
    limitBytes,
    beforeBytes: plan.beforeBytes,
    afterBytes: plan.afterBytes,
    entriesMoved: plan.entriesMoved,
    archive,
    backup,
  };
  if (args.dryRun || plan.entriesMoved === 0) {
    return report;
  }

  copyFileSync(file, backup, constants.COPYFILE_EXCL);
  const marker = `<!-- moved from ${role}.md by hq state trim at ${iso(args.at)} -->\n`;
  const existing = existsSync(archive) ? args.readText(archive) : '';
  appendFileSync(archive, (existing === '' || existing.endsWith('\n') ? '' : '\n') + marker + plan.moved);

  // another writer may have touched the file since the read; the rename would drop its change
  if (args.readText(file) !== text) {
    throw new HqError(
      'state_file_changed',
      `${role}.md changed while hq state trim ran, so it was not replaced. The moved entries are already appended to ${archive}, so a rerun repeats them there. The backup is ${backup}. Rerun hq state trim ${role}.`,
    );
  }
  const temp = join(directory, `${role}.md.tmp-${process.pid}`);
  writeFileSync(temp, plan.kept, { mode: statSync(file).mode & 0o777 });
  renameSync(temp, file);
  return { ...report, written: true };
}
