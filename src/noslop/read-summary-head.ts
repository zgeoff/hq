import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { parseJSON } from './parse-json.ts';

export type SummaryHead = { found: true; head: string; updatedAt: string } | { found: false; reason: string };

const MARKER_START = '<!-- noslop:summary ';

// The login of the noslop App that posts the summary comment. It must match the App's slug: under
// another login no comment counts, so every PR reads as one noslop never reviewed.
const NOSLOP_LOGIN = 'noslop-review[bot]';

// The head noslop's own last review read, taken the way noslop finds it: from the newest issue comment
// the noslop App posted that opens a summary marker.
export async function readSummaryHead(run: Runner, slug: string, pr: number): Promise<SummaryHead> {
  const path = `repos/${slug}/issues/${pr}/comments`;
  const result = await run(['gh', 'api', path, '--paginate', '--jq', '.[] | {login: .user.login, body, updatedAt: .updated_at}']);
  if (result.code !== 0) {
    return { found: false, reason: `gh cannot read the comments of the PR (${(result.stderr || result.stdout).trim().slice(0, 300)})` };
  }
  const comments = parseComments(result.stdout);
  if (comments === null) {
    return { found: false, reason: `gh api ${path} printed a line that is not a comment` };
  }
  const newest = comments.findLast((comment) => comment.login === NOSLOP_LOGIN && comment.body.includes(MARKER_START));
  if (newest === undefined) {
    return { found: false, reason: 'noslop has posted no review summary on the PR' };
  }
  return parseMarkerHead(newest);
}

const CommentSchema = z.object({ login: z.string().nullish(), body: z.string().nullable().transform((body) => body ?? ''), updatedAt: z.iso.datetime() });

type Comment = z.output<typeof CommentSchema>;

function parseComments(text: string): Comment[] | null {
  const parsed = z
    .array(CommentSchema)
    .safeParse(
      text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => parseJSON(line)),
    );
  return parsed.success ? parsed.data : null;
}

const SUMMARY_MARKER = /<!-- noslop:summary (?<json>.*?) -->/su;

const MarkerSchema = z.looseObject({ head: z.string().regex(/^[0-9a-f]{40}$/u) });

// The newest summary comment is the summary, so one whose marker does not close or parse blocks,
// rather than fall back to an older one. A `>` in the marker is a JSON escape, which JSON.parse undoes.
function parseMarkerHead(comment: Comment): SummaryHead {
  const json = SUMMARY_MARKER.exec(comment.body)?.groups?.['json'];
  const marker = json === undefined ? undefined : parseJSON(json);
  const parsed = MarkerSchema.safeParse(marker);
  if (!parsed.success) {
    return { found: false, reason: "hq cannot read the head in noslop's summary marker on the PR" };
  }
  return { found: true, head: parsed.data.head, updatedAt: comment.updatedAt };
}
