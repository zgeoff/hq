import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import type { PrFacts } from './types.ts';

const OWNER = 'zgeoff';
const ownerOf = (p: { url: string | null }) => (p.url ? /github\.com\/([\w.-]+)\//.exec(p.url)?.[1] : null) ?? OWNER;

const BaseChangeSchema = z.object({ previousRefName: z.string().optional() });
const TimelineSchema = z.object({ nodes: z.array(BaseChangeSchema) });
const BranchRefSchema = z.object({ name: z.string() });
const RepositorySchema = z.object({ defaultBranchRef: BranchRefSchema.nullable() });
const PullRequestFieldsSchema = z.object({ additions: z.number(), deletions: z.number(), baseRefName: z.string(), repository: RepositorySchema, timelineItems: TimelineSchema });
const PullRequestSchema = z.object({ pullRequest: PullRequestFieldsSchema.nullable() });
const BranchSchema = z.object({ pullRequests: z.object({ totalCount: z.number() }) });
const ReplySchema = z.object({ data: z.record(z.string(), z.unknown()).nullish() });

// A base counts as a stack only when another PR's head was that branch (a release branch is not).
// A merged PR doesn't change, so its facts are cached for good.
export async function prFacts(db: Database, run: Runner, prs: { ref: string; url: string | null }[], env?: RunOpts['env']): Promise<Record<string, PrFacts> | null> {
  const cache = metaJson(db, 'stats_pr_facts_v2', z.record(z.string(), z.object({ lines: z.number(), stacked: z.boolean() })), {});
  const todo = [...new Map(prs.filter((p) => !cache[p.ref]).map((p) => [p.ref, p])).values()];
  if (todo.some((p) => !/^[\w.-]+$/.test(ownerOf(p)) || !/^[\w.-]+#\d+$/.test(p.ref))) return null;
  const ask = async (parts: string[]): Promise<Record<string, unknown> | null> => {
    const r = await run(['gh', 'api', 'graphql', '-f', `query=query { ${parts.join(' ')} }`], env ? { env } : {});
    try {
      // GitHub answers a missing repo or PR with partial data and errors: keep what it found.
      const data = ReplySchema.parse(JSON.parse(r.stdout)).data ?? {};
      return r.code !== 0 && !Object.values(data).some(Boolean) ? null : data;
    } catch {
      return null;
    }
  };
  const found: { p: (typeof todo)[number]; lines: number; bases: string[] }[] = [];
  for (let i = 0; i < todo.length; i += 25) {
    const chunk = todo.slice(i, i + 25);
    const data = await ask(
      chunk.map((p, k) => {
        const [repo, num] = p.ref.split('#');
        return `p${k}: repository(owner: "${ownerOf(p)}", name: "${repo}") { pullRequest(number: ${Number(num)}) { additions deletions baseRefName repository { defaultBranchRef { name } } timelineItems(itemTypes: [BASE_REF_CHANGED_EVENT], first: 20) { nodes { ... on BaseRefChangedEvent { previousRefName } } } } }`;
      }),
    );
    if (!data) return null;
    chunk.forEach((p, k) => {
      const pr = PullRequestSchema.nullish().parse(data[`p${k}`])?.pullRequest;
      if (!pr) return;
      const main = pr.repository.defaultBranchRef?.name ?? 'main';
      const bases = [pr.baseRefName, ...pr.timelineItems.nodes.map((n) => n.previousRefName ?? '')].filter((b) => b && b !== main);
      found.push({ p, lines: pr.additions + pr.deletions, bases: [...new Set(bases)] });
    });
  }
  const key = (p: { ref: string; url: string | null }, b: string) => `${ownerOf(p)}/${p.ref.split('#')[0]}:${b}`;
  const branches = [...new Map(found.flatMap((f) => f.bases.map((b) => [key(f.p, b), { owner: ownerOf(f.p), repo: f.p.ref.split('#')[0]!, b }]))).entries()];
  const fromPr = new Set<string>();
  const unknown = new Set<string>();
  for (let i = 0; i < branches.length; i += 25) {
    const chunk = branches.slice(i, i + 25);
    const data = await ask(chunk.map(([, x], k) => `b${k}: repository(owner: "${x.owner}", name: "${x.repo}") { pullRequests(headRefName: ${JSON.stringify(x.b)}, first: 1) { totalCount } }`));
    if (!data) return null;
    chunk.forEach(([id], k) => {
      const hit = BranchSchema.nullish().parse(data[`b${k}`]);
      if (!hit) unknown.add(id);
      else if (hit.pullRequests.totalCount > 0) fromPr.add(id);
    });
  }
  const known = found.filter((f) => !f.bases.some((b) => unknown.has(key(f.p, b))));
  for (const f of known) cache[f.p.ref] = { lines: f.lines, stacked: f.bases.some((b) => fromPr.has(key(f.p, b))) };
  if (known.length) setMeta(db, 'stats_pr_facts_v2', JSON.stringify(cache));
  return Object.fromEntries(prs.filter((p) => cache[p.ref]).map((p) => [p.ref, cache[p.ref]!]));
}
