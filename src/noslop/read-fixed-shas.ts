import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { parseJSON } from './parse-json.ts';

const ANY_MARKER = '<!-- noslop:',
  FINDING_MARKER = /<!-- noslop:finding (?<json>\{.*?\}) -->/su,
  FIXED_LINE = /^fixed\s+(?<sha>[0-9a-f]{7,40})$/u,
  ISSUE_REPLY = /^(?<id>[0-9a-f]{16})\s+(?<reply>.+)$/su,
  IssueCommentSchema = z.object({ body: z.string().nullable().transform((body) => body ?? '') }),
  ReviewCommentSchema = z.object({ id: z.number(), in_reply_to_id: z.number().nullish(), body: z.string().nullable().transform((body) => body ?? '') });

type ReviewComment = z.output<typeof ReviewCommentSchema>;
type IssueComment = z.output<typeof IssueCommentSchema>;

// The shas the PR's `fixed <sha>` answers name, read the way noslop reads them: the first line of a
// reply in a finding's review thread, or an issue comment that starts with an issue finding's id.
// A comment that holds a noslop marker is noslop's own, never an answer.
export async function readFixedShas(run: Runner, slug: string, pr: number): Promise<string[]> {
  const issuePath = `repos/${slug}/issues/${pr}/comments`,
    issueText = await readComments(run, issuePath, '{body}'),
    reviewPath = `repos/${slug}/pulls/${pr}/comments`,
    reviewText = await readComments(run, reviewPath, '{id, in_reply_to_id, body}');
  return [...new Set([...collectThreadShas(parseLines(reviewText, ReviewCommentSchema, reviewPath)), ...collectIssueShas(parseLines(issueText, IssueCommentSchema, issuePath))])];
}

async function readComments(run: Runner, path: string, fields: string): Promise<string> {
  const result = await run(['gh', 'api', path, '--paginate', '--jq', `.[] | ${fields}`]);
  if (result.code !== 0) {
    throw new HqError('command_failed', `gh api ${path} failed (${result.code}): ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
  }
  return result.stdout;
}

// gh prints one compact JSON object a line for `--jq '.[] | …'`. A line that is not a comment
// refuses the whole read, so no answer is guessed from output hq cannot read.
function parseLines<T extends z.ZodType>(text: string, schema: T, path: string): z.output<T>[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parsed = schema.safeParse(parseJSON(line));
      if (!parsed.success) {
        throw new HqError('command_failed', `gh api ${path} printed a line that is not a comment: ${line.slice(0, 120)}`);
      }
      return parsed.data;
    });
}

function collectThreadShas(comments: ReviewComment[]): string[] {
  const roots = new Set(comments.filter((c) => (c.in_reply_to_id ?? null) === null && findMarkerID(c.body) !== null).map((c) => c.id));
  return comments.flatMap((c) => (c.in_reply_to_id !== undefined && c.in_reply_to_id !== null && roots.has(c.in_reply_to_id) && !c.body.includes(ANY_MARKER) ? toFixedShas(c.body) : []));
}

function collectIssueShas(comments: IssueComment[]): string[] {
  const findings = new Set(comments.map((c) => findMarkerID(c.body)).filter((id) => id !== null));
  return comments.flatMap((c) => {
    const found = ISSUE_REPLY.exec(c.body.trim()),
      id = found?.groups?.['id'];
    return id !== undefined && findings.has(id) && !c.body.includes(ANY_MARKER) ? toFixedShas(found?.groups?.['reply'] ?? '') : [];
  });
}

function findMarkerID(body: string): string | null {
  const json = FINDING_MARKER.exec(body)?.groups?.['json'];
  if (json === undefined) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as { id?: unknown };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

// The sha of a reply whose first line is `fixed <sha>`; none for any other reply.
function toFixedShas(reply: string): string[] {
  const firstLine = reply.trim().split('\n', 1)[0]?.trim() ?? '',
    sha = FIXED_LINE.exec(firstLine)?.groups?.['sha'];
  return sha === undefined ? [] : [sha];
}
