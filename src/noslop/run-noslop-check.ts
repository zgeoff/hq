import { z } from 'zod';
import { formatIssue } from './format-issue.ts';
import { findRunFault } from './find-run-fault.ts';
import { NoslopCheckError } from './noslop-check-error.ts';
import { parseJSON } from './parse-json.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { buildSlug } from './build-slug.ts';
import { runNoslopCli } from './run-noslop-cli.ts';
import type { PRRequest } from './types.ts';

const CHECK_TIMEOUT_MS = 300_000;
const UNKNOWN_COMMAND = /unknown (?:command|argument)|unrecognized|not a (?:known )?command|invalid command/iu;

const OpenSchema = z.object({ id: z.string(), title: z.string().optional(), reason: z.string() });
const ConclusionSchema = z.enum(['success', 'failure']);
const OutcomeSchema = z.object({ conclusion: ConclusionSchema, title: z.string(), summary: z.string().optional(), open: z.array(OpenSchema).optional() });

// What noslop's check set on the PR's head: the conclusion, its title, and the first problem it names
// (an open finding with its reason, else the first line of its summary) when it failed, and every
// finding it lists as open.
export interface NoslopCheckOutcome {
  conclusion: 'success' | 'failure';
  title: string;
  problem: string | null;
  open: { id: string; reason: string }[];
}

// Sets noslop's check run again from the replies on the PR, with no review and no model call. noslop
// exits 0 whatever the check concludes, so a failed check is an outcome and a non-zero exit is a fault.
export async function runNoslopCheck(request: PRRequest, parsed: ParsedRepo): Promise<NoslopCheckOutcome> {
  const args = ['check', '--pr', String(request.pr), '--repo', buildSlug(parsed), '--json'];
  const cli = await runNoslopCli(request, parsed, args, CHECK_TIMEOUT_MS);
  if (cli.finished.code !== 0 && UNKNOWN_COMMAND.test(cli.tail)) {
    throw new NoslopCheckError('this noslop has no check command: pin a newer noslop (hq noslop pin <sha>)', 'check command missing');
  }
  const fault = findRunFault(cli.finished.code, cli.tail, CHECK_TIMEOUT_MS);
  if (fault !== null) {
    throw new NoslopCheckError(`noslop did not set its check (${fault})`, fault);
  }
  const answer = OutcomeSchema.safeParse(parseJSON(cli.finished.stdout));
  if (!answer.success) {
    throw new NoslopCheckError(`noslop did not set its check (output does not fit at ${formatIssue(answer.error)})`, 'bad check output');
  }
  return { conclusion: answer.data.conclusion, title: answer.data.title, problem: pickProblem(answer.data), open: (answer.data.open ?? []).map((finding) => ({ id: finding.id, reason: finding.reason })) };
}

function pickProblem(outcome: z.output<typeof OutcomeSchema>): string | null {
  if (outcome.conclusion === 'success') {
    return null;
  }
  const first = outcome.open?.[0];
  if (first !== undefined) {
    return `${first.id}: ${first.reason}`;
  }
  const line = outcome.summary?.split('\n').find((text) => text.trim() !== '');
  return line?.trim() ?? outcome.title;
}
