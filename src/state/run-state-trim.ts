import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { HqError } from '../errors.ts';
import { buildTrimPlan } from './build-trim-plan.ts';
import { getStateLimit } from './get-state-limit.ts';
import type { StateFiles, TrimReport } from './types.ts';

export interface StateTrimArgs {
  directory: string;
  roles: string[];
  role: string;
  actor: string;
  dryRun: boolean;
  at: Date;
  files: StateFiles;
}

// Move the oldest "## Log" entries of <role>.md to this month's archive until the file fits its limit.
// Order: backup, archive append, then an atomic replace; no backup, no write.
export function runStateTrim(args: StateTrimArgs): TrimReport {
  const directory = args.directory;
  const role = args.role;
  const files = args.files;
  if (!args.roles.includes(role)) {
    throw new HqError('unknown_role', `${role} is not a fleet role (${args.roles.join(', ')}), so it has no state file to trim`);
  }
  const owner = `z-${role}`;

  // only the owning session writes its state file, and it is blocked while it runs this command, so no write can land between the read and the rename
  if (!args.dryRun && args.actor !== owner) {
    throw new HqError('not_owner', `only ${owner} may trim ${role}.md, not ${args.actor}; anyone may run hq state trim ${role} --dry-run`);
  }
  const file = join(directory, `${role}.md`);
  if (!files.probeExists(file)) {
    throw new HqError('no_state_file', `${file} does not exist`);
  }
  const text = files.readText(file);
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

  // the archive and the temp file take the state file's mode, so a private state file never lands in a wider one
  const mode = files.readMode(file);
  files.copyNew(file, backup);
  const marker = `<!-- moved from ${role}.md by hq state trim at ${iso(args.at)} -->\n`;
  const archiveExists = files.probeExists(archive);
  if (archiveExists && (files.readMode(archive) & ~mode) !== 0) {
    files.changeMode(archive, mode);
  }
  const existing = archiveExists ? files.readText(archive) : '';
  files.appendText(archive, (existing === '' || existing.endsWith('\n') ? '' : '\n') + marker + plan.moved, mode);

  const temp = join(directory, `${role}.md.tmp-${process.pid}`);
  files.writeText(temp, plan.kept, mode);

  // a write that ignores the session block would be dropped by the rename, so this check sits right before it
  if (files.readText(file) !== text) {
    files.removeFile(temp);
    throw new HqError(
      'state_file_changed',
      `${role}.md changed while hq state trim ran, so it was not replaced. The moved entries are already appended to ${archive}, so a rerun repeats them there. The backup is ${backup}. Rerun hq state trim ${role}.`,
    );
  }
  files.renameFile(temp, file);
  return { ...report, written: true };
}
