import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { GitReadError } from './git-read-error.ts';
import { parseJSON } from './parse-json.ts';

export interface MergeVerdicts {
  checked: ReadonlySet<string>;
  rejected: ReadonlySet<string>;
}

const CommentSchema = z.object({ login: z.string().nullish(), body: z.string().nullable().transform((body) => body ?? '') }),
  MARKER_START = '<!-- noslop:summary ',
  MarkerSchema = z.looseObject({ checkedMerges: z.array(z.string()).optional(), rejectedMerges: z.array(z.string()).optional() }),

  // The login of the noslop App that posts the summary comment. It must match the App's slug: under
  // another login no comment counts, so every merge with a conflict resolution reads as not checked.
  NOSLOP_LOGIN = 'noslop-review[bot]',
  SUMMARY_MARKER = /<!-- noslop:summary (?<json>.*?) -->/su;

// The merges the summary marker holds as checked and as rejected, read the way noslop finds it: the
// newest issue comment the noslop App posted that holds one, none when there is none. Throws
// GitReadError when gh fails or the marker does not parse.
export async function readMergeVerdicts(run: Runner, slug: string, pr: number): Promise<MergeVerdicts> {
  const path = `repos/${slug}/issues/${pr}/comments`,
    result = await run(['gh', 'api', path, '--paginate', '--jq', '.[] | {login: .user.login, body}']);
  if (result.code !== 0) {
    throw new GitReadError(`gh cannot read the comments of the PR (${(result.stderr || result.stdout).trim().slice(0, 300)})`);
  }
  return buildMergeVerdicts(pickMarkerJSON(parseComments(result.stdout, path)));
}

function buildMergeVerdicts(json: string | null): MergeVerdicts {
  return json === null ? { checked: new Set<string>(), rejected: new Set<string>() } : parseMarker(json);
}

// A `>` in the marker is escaped as a JSON escape, which JSON.parse undoes.
function parseMarker(json: string): MergeVerdicts {
  const parsed = MarkerSchema.safeParse(parseJSON(json));
  if (!parsed.success) {
    throw new GitReadError("hq cannot read noslop's summary marker on the PR");
  }
  return { checked: new Set(parsed.data.checkedMerges), rejected: new Set(parsed.data.rejectedMerges) };
}

// The newest App comment that opens a summary marker is the summary, so one whose marker does not
// close or parse fails, rather than fall back to an older one.
function pickMarkerJSON(comments: z.output<typeof CommentSchema>[]): string | null {
  const newest = comments.findLast((c) => c.login === NOSLOP_LOGIN && c.body.includes(MARKER_START));
  return newest === undefined ? null : pickWholeMarker(newest.body);
}

function pickWholeMarker(body: string): string {
  const json = SUMMARY_MARKER.exec(body)?.groups?.['json'];
  if (json === undefined) {
    throw new GitReadError("hq cannot read noslop's summary marker on the PR");
  }
  return json;
}

function parseComments(text: string, path: string): z.output<typeof CommentSchema>[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const parsed = CommentSchema.safeParse(parseJSON(line));
      if (!parsed.success) {
        throw new GitReadError(`gh api ${path} printed a line that is not a comment: ${line.slice(0, 120)}`);
      }
      return parsed.data;
    });
}
