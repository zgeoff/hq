import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { parseJSON } from './parse-json.ts';

export type NoslopCheck = { found: true; status: string; conclusion: string | null; title: string | null } | { found: false; reason: string };

// The App's slug: a workflow job named `noslop` runs under another app, and the PR's check rollup
// does not name the app, so only this REST read can tell the two apart.
const NOSLOP_APP = 'noslop-review';

const NOSLOP_CHECK = 'noslop';

// noslop's own check run at one commit. The newest run wins by id, since GitHub numbers runs in the
// order it creates them, and a re-run can start in the same second as the run it replaces.
export async function readNoslopCheck(run: Runner, slug: string, sha: string): Promise<NoslopCheck> {
  const path = `repos/${slug}/commits/${sha}/check-runs?check_name=${NOSLOP_CHECK}&filter=all&per_page=100`;
  const result = await run(['gh', 'api', path, '--paginate', '--jq', '.check_runs[] | {id, name, app: .app.slug, status, conclusion, title: .output.title}']);
  if (result.code !== 0) {
    return { found: false, reason: `gh cannot read the check runs at ${sha.slice(0, 7)} (${(result.stderr || result.stdout).trim().slice(0, 300)})` };
  }
  const runs = parseRuns(result.stdout);
  if (runs === null) {
    return { found: false, reason: `gh api ${path} printed a line that is not a check run` };
  }
  const newest = runs.filter((checkRun) => checkRun.app === NOSLOP_APP && checkRun.name === NOSLOP_CHECK).reduce<CheckRun | null>((held, checkRun) => (held === null || checkRun.id > held.id ? checkRun : held), null);
  if (newest === null) {
    return { found: false, reason: `noslop has no check at ${sha.slice(0, 7)}` };
  }
  return { found: true, status: newest.status, conclusion: newest.conclusion, title: newest.title };
}

const CheckRunSchema = z.object({ id: z.number(), name: z.string(), app: z.string().nullable(), status: z.string(), conclusion: z.string().nullable(), title: z.string().nullable() });

type CheckRun = z.output<typeof CheckRunSchema>;

function parseRuns(text: string): CheckRun[] | null {
  const parsed = z
    .array(CheckRunSchema)
    .safeParse(
      text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => parseJSON(line)),
    );
  return parsed.success ? parsed.data : null;
}
