import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import invariant from 'tiny-invariant';
import { now } from '../clock/now.ts';
import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import type { OwnerProbeDeps } from '../pr-status/read-owner-session.ts';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { roleName } from '../roles/role-name.ts';
import { parseJobAdd } from './parse-job-add.ts';
import type { JobAddFlags } from './parse-job-add.ts';
import { pickJobAccess } from './pick-job-access.ts';
import { readJob } from './read-job.ts';
import { readJobCaller } from './read-job-caller.ts';
import { readJobs } from './read-jobs.ts';
import { removeJob } from './remove-job.ts';
import type { SessionJob } from './types.ts';
import { writeJob } from './write-job.ts';

export interface JobsCommandInput {
  db: Database;
  verb: string | undefined;
  rest: string[];
  flags: JobAddFlags;
  probe: OwnerProbeDeps;
}

export function runJobsCommand(input: JobsCommandInput): Promise<Out> {
  return match(input.verb)
    .with('add', () => runJobAdd(input))
    .with('list', () => Promise.resolve(runJobList(input)))
    .with('remove', () => runJobRemove(input))
    .otherwise(() => {
      throw new HqError('bad_args', `unknown command: hq jobs ${input.verb ?? ''}`.trim());
    });
}

async function runJobAdd(input: JobsCommandInput): Promise<Out> {
  const declared = getDeclaredSessions().map((session) => session.name);
  const parsed = parseJobAdd({ target: input.rest[0], flags: input.flags, declared, at: now() });
  if (!parsed.ok) {
    throw new HqError('bad_args', parsed.reason);
  }
  const actor = await requireJobAccess(input, parsed.job.target);
  const job = writeJob(input.db, { ...parsed.job, actor });
  return { data: { job }, text: `Added job ${job.id} for ${job.target}: ${formatSchedule(job)}, first at ${job.next_at}` };
}

async function requireJobAccess(input: JobsCommandInput, target: string): Promise<string> {
  const caller = await readJobCaller(input.db, input.probe);
  const access = pickJobAccess({ caller, target, owner: roleName('owner') });
  if (!access.allowed) {
    throw new HqError('not_allowed', access.reason);
  }
  invariant(caller.kind === 'named', 'access is granted only to a named caller');
  return caller.name;
}

function formatSchedule(job: SessionJob): string {
  return `${job.kind} ${job.spec}`;
}

function runJobList(input: JobsCommandInput): Out {
  const jobs = readJobs(input.db, input.rest[0] ?? null);
  return {
    data: { jobs },
    text: jobs.length > 0 ? jobs.map((job) => `${job.id} ${job.target} ${formatSchedule(job)} next ${job.next_at}: ${job.prompt}`).join('\n') : 'No jobs.',
  };
}

async function runJobRemove(input: JobsCommandInput): Promise<Out> {
  const raw = input.rest[0] ?? '';
  if (!/^\d+$/u.test(raw)) {
    throw new HqError('bad_args', 'hq jobs remove needs a job id, like 7');
  }
  const job = readJob(input.db, Number(raw));
  if (job === null || job.removed_at !== null) {
    throw new HqError('not_found', `no job ${raw}`);
  }
  const actor = await requireJobAccess(input, job.target);
  const removed = removeJob(input.db, job.id, actor);
  return { data: { removed }, text: `Removed job ${removed.id} for ${removed.target}` };
}
