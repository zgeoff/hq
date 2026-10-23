import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { proveMechanical } from '../noslop/prove-mechanical.ts';
import { readHeldDiffs } from '../noslop/read-held-diffs.ts';
import { roleName } from '../roles/role-name.ts';
import { addNews } from '../news/add-news.ts';
import { formatHeldFiles } from './format-held-files.ts';
import type { PRCommandInput } from './run-pr-command.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readReviewHold } from './read-review-hold.ts';
import { recordPRMechanical } from './record-pr-mechanical.ts';

// `hq pr mechanical`: hq reads the diff at the head and proves it mechanical itself; z-review's
// word is never the proof. A pass is recorded at that head and goes into hq news; a refusal names
// the first file and line and records nothing.
export async function runPRMechanical(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const actor = await input.actor();
  const probe = await input.readReviewerSession();
  const hold = await readReviewHold(input.run, ref, actor, probe);
  const read = await readHeldDiffs({ run: input.run, slug: ref.slug, repo: ref.repo, pr: ref.pr, head: hold.head, paths: hold.files, repoDir: input.flags['repo-dir'] }).catch((error: unknown) => {
    throw new HqError('git_unreadable', `hq could not read the diff of ${ref.slug}#${ref.pr} to prove it: ${error instanceof Error ? error.message : String(error)}`);
  });
  const proof = proveMechanical(read.files, read.facts);
  if (!proof.pass) {
    throw new HqError('not_mechanical', `hq does not prove ${ref.slug}#${ref.pr} mechanical at ${hold.head.slice(0, 7)}: ${proof.reason}; it needs the owner's lgtm`);
  }
  recordPRMechanical(input.db, { repo: ref.repo, pr: ref.pr, head: hold.head, files: proof.files, lines: proof.lines, actor });
  const text = `${roleName('reviewer')} approved mechanical skill edits on ${ref.repo}#${ref.pr} at ${hold.head.slice(0, 7)}: ${formatHeldFiles(proof.files)} (${proof.lines} lines)`;
  addNews(input.db, { from: actor, topic: 'merge', text, issue: null, link: null, needsGeoff: false });
  return { data: { mechanical: { repo: ref.repo, pr: ref.pr, head: hold.head, files: proof.files, lines: proof.lines } }, text: `Recorded ${text}` };
}
