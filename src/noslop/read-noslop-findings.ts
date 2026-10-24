import { z } from 'zod';
import { recordOpRead } from '../one-password/record-op-read.ts';
import { checkout } from '../review/checkout.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import { buildNoslopCommand } from './build-noslop-command.ts';
import { buildNoslopEnv } from './build-noslop-env.ts';
import { buildRunDir } from './build-run-dir.ts';
import { buildSlug } from './build-slug.ts';
import { findRunFault } from './find-run-fault.ts';
import { formatIssue } from './format-issue.ts';
import { getTail } from './get-tail.ts';
import { loadNoslopSecrets } from './load-noslop-secrets.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import { NoslopCheckError } from './noslop-check-error.ts';
import { parseJSON } from './parse-json.ts';
import type { ParsedRepo } from './parse-lower-repo.ts';
import { requirePinned } from './require-pinned.ts';
import { resolveNoslopDir } from './resolve-noslop-dir.ts';
import type { PRRequest } from './types.ts';

const FindingSchema = z.object({
  id: z.string(),
  path: z.string().nullable().optional(),
  severity: z.string().optional(),
  state: z.enum(['open', 'fixed', 'not-a-defect', 'deferred', 'accepted-risk']),
  author: z.string().nullable().optional(),
});
const FindingsSchema = z.object({ findings: z.array(FindingSchema) });
const FINDINGS_TIMEOUT_MS = 300_000;
const UNKNOWN_COMMAND = /unknown (?:command|argument)|unrecognized|not a (?:known )?command|invalid command/iu;

export type NoslopFinding = z.output<typeof FindingSchema>;

export async function readNoslopFindings(request: PRRequest, parsed: ParsedRepo): Promise<NoslopFinding[]> {
  const sha = requirePinned(loadNoslopSettings(request.db).sha);
  const slug = buildSlug(parsed);
  const directory = await checkout(request.run, slug, parsed.repo, request.repoDir);
  const secrets = await loadNoslopSecrets(request.run, () => recordOpRead(request.db, 'noslop', 1));
  const clone = buildRunDir(resolveNoslopDir(), sha);
  const args = ['findings', '--pr', String(request.pr), '--repo', slug, '--json'];
  const finished = await boundedRunner(request.run, FINDINGS_TIMEOUT_MS)(buildNoslopCommand(clone, args), { cwd: directory, env: buildNoslopEnv(secrets) });
  const tail = getTail(finished.stderr, secrets);
  if (finished.code !== 0 && UNKNOWN_COMMAND.test(tail)) {
    throw new NoslopCheckError('this noslop has no findings command: pin noslop 0.4.15 or later (hq noslop pin <sha>)', 'findings command missing');
  }
  const fault = findRunFault(finished.code, tail, FINDINGS_TIMEOUT_MS);
  if (fault !== null) {
    throw new NoslopCheckError(`noslop gave no findings (${fault}): this is no pass`, fault);
  }
  const answer = FindingsSchema.safeParse(parseJSON(finished.stdout));
  if (!answer.success) {
    throw new NoslopCheckError(`noslop gave no findings (output does not fit at ${formatIssue(answer.error)}): this is no pass`, 'bad findings output');
  }
  return answer.data.findings;
}
