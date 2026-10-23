import type { Out } from '../commands.ts';
import { HqError } from '../errors.ts';
import { roleName } from '../roles/role-name.ts';
import { addNews } from '../news/add-news.ts';
import { EXEMPT_RULES } from './exempt-rules.ts';
import { formatHeldFiles } from './format-held-files.ts';
import type { PRCommandInput } from './run-pr-command.ts';
import type { PRRef } from './parse-pr-ref.ts';
import { readReviewHold } from './read-review-hold.ts';
import { recordPRExemption } from './record-pr-exemption.ts';

const NEWS_LIMIT = 400;

// `hq pr exempt`: z-review's record that a policy exception covers the PR's repo instruction files
// at this head. hq proves none of the rules, and the news line says so.
export async function runPRExempt(input: PRCommandInput, ref: PRRef): Promise<Out> {
  const rule = EXEMPT_RULES.find((candidate) => candidate === input.flags.rule);
  const note = (input.flags.note ?? '').replaceAll(/\s+/gu, ' ').trim();
  if (rule === undefined || note === '') {
    throw new HqError('bad_args', `usage: hq pr exempt <repo> <pr> --rule ${EXEMPT_RULES.join('|')} --note <why the rule covers the PR>`);
  }
  const actor = await input.actor();
  const hold = await readReviewHold(input.run, ref, actor);
  recordPRExemption(input.db, { repo: ref.repo, pr: ref.pr, head: hold.head, rule, note, files: hold.files, actor });
  const reviewer = roleName('reviewer');
  const caveat = rule === 'repo-sync' ? `${reviewer}'s call, not proved by hq; hq did not check the files against the sync source` : `${reviewer}'s call, not proved by hq`;
  const lead = `${reviewer} exempted ${ref.repo}#${ref.pr} at ${hold.head.slice(0, 7)} from the instruction-file hold under the ${rule} rule (${caveat}): ${listFiles(rule, hold.files, ref)}`;
  const text = `${lead}. Note: ${note}`.slice(0, NEWS_LIMIT);
  addNews(input.db, { from: actor, topic: 'merge', text, issue: null, link: null, needsGeoff: false });
  return { data: { exemption: { repo: ref.repo, pr: ref.pr, head: hold.head, rule, note, files: hold.files } }, text: `Recorded ${text}` };
}

// What is left of the line once the lead's fixed words and a short note are counted.
const FILE_LIST_LIMIT = 150;

// A repo-sync exemption lists every held file, so the owner can spot an extra edit. When the whole
// list cannot fit one news line, the line counts them and points to `hq pr status`, which lists
// all of them.
function listFiles(rule: string, files: string[], ref: PRRef): string {
  if (rule !== 'repo-sync') {
    return formatHeldFiles(files);
  }
  const all = files.join(', ');
  return all.length <= FILE_LIST_LIMIT ? all : `${files.length} held files, all listed by hq pr status ${ref.repo} ${ref.pr}`;
}
