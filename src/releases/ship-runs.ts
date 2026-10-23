// Release-aware runs: a run whose merged PRs have all shipped in a release moves on by itself,
// to live-check (a check is owed) or to done (live_check is 'none'). Releases come from a fixed
// table of repos; a repo with no source is never moved by hq. One pass is `shipRuns`; the watcher
// runs it every 10 minutes and `hq run ship` runs it by hand.
import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { readBuild as readInstalledBuild } from '../build/read-build.ts';
import type { Build } from '../build/read-build.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { roleName } from '../roles/role-name.ts';
import type { Runner } from '../runner/types.ts';
import { setState } from '../runs/set-state.ts';
import type { Run, RunPr } from '../runs/types.ts';
import { ACTOR } from './actor.ts';
import { buildShippedPR } from './build-shipped-pr.ts';
import { formatShippedAt } from './format-shipped-at.ts';
import { COMPARED } from './compared.ts';
import { COMPARED_ROWS } from './compared-rows.ts';
import { CURSOR } from './cursor.ts';
import { getPRNumber as numOf } from './get-pr-number.ts';
import { getRepo as repoOf } from './get-repo.ts';
import { ERRORS } from './errors.ts';
import { HEX40 } from './hex40.ts';
import { liveCheckRecipients } from './live-check-recipients.ts';
import { keepCompared } from './keep-compared.ts';
import { MAX_COMPARES } from './max-compares.ts';
import { OWNER } from './owner.ts';
import { parseReleases } from './parse-releases.ts';
import type { Gate } from './parse-gate.ts';
import { readGate } from './read-gate.ts';
import { readPackageReleases } from './read-package-releases.ts';
import { readShipment } from './read-shipment.ts';
import { runGH as gh } from './run-gh.ts';
import { SHIPPABLE } from './shippable.ts';
import { shippedText } from './shipped-text.ts';
import { SOURCES } from './sources.ts';
import { isHeldPastShip } from './is-held-past-ship.ts';
import { readHeldAt } from './read-held-at.ts';
import type { PrState, Release, ShipMove, ShipResult, Source } from './types.ts';

// One pass. A dry run reads from GitHub but writes nothing.
export async function shipRuns(db: Database, run: Runner, at: Date = now(), opts: { dryRun?: boolean; readBuild?: () => Build } = {}): Promise<ShipResult> {
  const dryRun = !!opts.dryRun;
  const res: ShipResult = { dryRun, moved: [], shippedPrs: 0, compares: 0, deferred: 0, held: [], errors: [] };
  const err = (m: string) => res.errors.push(m);

  const runs = db.query(`SELECT * FROM runs WHERE state IN ('merged','deploying','deploy-held') ORDER BY created_at`).all() as Run[];
  const prsOf = (issue: string) => db.query('SELECT * FROM run_prs WHERE issue = ? ORDER BY added_at').all(issue) as RunPr[];
  const states = new Map<string, PrState>();
  const candidates: { run: Run; refs: string[] }[] = [];
  for (const r of runs) {
    const prs = prsOf(r.issue);
    const merged = prs.filter((p) => p.state === 'merged');
    if (!merged.length || prs.some((p) => p.state === 'open')) continue;
    if (merged.some((p) => !(repoOf(p.ref) in SOURCES))) continue; // no release source: hq never moves it
    for (const pr of merged) {
      states.set(pr.ref, { ref: pr.ref, repo: repoOf(pr.ref), sha: pr.merge_sha, tag: pr.shipped_tag, at: pr.shipped_at, mergedAt: pr.merged_at });
    }
    candidates.push({ run: r, refs: merged.map((p) => p.ref) });
  }

  const failedRepos = new Set<string>();
  const releases = new Map<string, Release[]>();
  const getReleases = async (repo: string): Promise<Release[] | null> => {
    if (failedRepos.has(repo)) return null;
    const have = releases.get(repo);
    if (have) return have;
    try {
      const list = await releasesOf(run, repo, SOURCES[repo]!, at);
      releases.set(repo, list);
      return list;
    } catch (e) {
      failedRepos.add(repo);
      err(`${repo}: ${(e as Error).message}`);
      return null;
    }
  };

  const failedGates = new Set<string>();
  const gates = new Map<string, Gate>();
  const readGateOnce = async (repo: string, name: string): Promise<Gate | null> => {
    const key = `${repo}:${name}`;
    if (failedGates.has(key)) {
      return null;
    }
    const have = gates.get(key);
    if (have) {
      return have;
    }
    try {
      const gate = await readGate(run, repo, name);
      gates.set(key, gate);
      return gate;
    } catch (error) {
      failedGates.add(key);
      err(`${repo}: ${String(error instanceof Error ? error.message : error)}`);
      return null;
    }
  };

  // A release tag or a build commit never moves, so its answer holds across passes: a scan the
  // compare cap cut off resumes instead of starting over. A moving ref is asked again each pass.
  const compared = new Map(Object.entries(metaJson(db, COMPARED, COMPARED_ROWS, {})));
  const contains = async (repo: string, sha: string, tag: string): Promise<boolean | 'cap'> => {
    const key = `${repo}:${sha}:${tag}`;
    const known = compared.get(key);
    if (known !== undefined) return known;
    if (res.compares >= MAX_COMPARES) return 'cap';
    res.compares++;
    const out = (await gh(run, ['api', `repos/${OWNER}/${repo}/compare/${sha}...${encodeURIComponent(tag)}`, '--jq', '.status'], `compare ${sha.slice(0, 7)} with ${tag}`)).trim();
    let status = out;
    if (out.startsWith('{')) {
      try {
        status = String((JSON.parse(out) as { status?: unknown }).status);
      } catch {}
    }
    if (!['ahead', 'identical', 'behind', 'diverged'].includes(status)) throw new HqError('bad_compare', `compare ${sha.slice(0, 7)} with ${tag} gave "${status.slice(0, 30)}"`);
    const yes = status === 'ahead' || status === 'identical';
    if (SOURCES[repo]?.kind !== 'ref') {
      compared.set(key, yes);
    }
    return yes;
  };

  const save = (s: PrState) => {
    if (dryRun) return;
    db.query('UPDATE run_prs SET merge_sha = ?, shipped_tag = ?, shipped_at = ? WHERE ref = ?').run(s.sha, s.tag, s.at, s.ref);
  };

  const deps = {
    run,
    readBuild: opts.readBuild ?? readInstalledBuild,
    contains,
    getReleases,
    readGate: readGateOnce,
    isCapped: () => res.compares >= MAX_COMPARES,
    hasFailed: (repo: string) => failedRepos.has(repo),
  };

  const from = getMeta(db, CURSOR);
  const k = from ? candidates.findIndex((c) => c.run.issue === from) : -1;
  const order = k > 0 ? [...candidates.slice(k), ...candidates.slice(0, k)] : candidates;
  let firstDeferred: string | null = null;
  const seen = new Set<string>();
  for (const c of order) {
    for (const ref of c.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      const s = states.get(ref)!;
      if (s.at) {
        continue;
      }
      try {
        if (!s.sha) {
          const out = await gh(run, ['pr', 'view', numOf(ref), '-R', `${OWNER}/${s.repo}`, '--json', 'mergeCommit'], `pr view ${ref}`);
          const sha = (JSON.parse(out) as { mergeCommit?: { oid?: unknown } | null }).mergeCommit?.oid;
          if (typeof sha !== 'string' || !HEX40.test(sha)) throw new HqError('bad_pr', `${ref} has no merge commit`);
          s.sha = sha;
          save(s);
        }
        const found = await readShipment(deps, s, s.sha);
        if (found === 'cap') {
          res.deferred++;
          firstDeferred ??= c.run.issue;
          continue;
        }
        if (found) {
          const shipped = { ...s, tag: found.tag, at: found.at ?? iso(at) };
          save(shipped);
          Object.assign(s, shipped);
          res.shippedPrs++;
        }
      } catch (e) {
        err(`${ref}: ${(e as Error).message}`);
      }
    }
  }
  if (!dryRun) {
    setMeta(db, CURSOR, firstDeferred ?? '');
    const waiting = new Set([...states.values()].flatMap((state) => (state.at || !state.sha ? [] : [state.sha])));
    setMeta(db, COMPARED, JSON.stringify(keepCompared(compared, waiting)));
  }

  // The moves and the message that tells of them commit together: a pass that stops between them
  // would leave runs moved that the next pass never tells anyone about.
  const moveShipped = () => {
    for (const c of candidates) {
      const shippedAt = c.refs.flatMap((ref) => states.get(ref)?.at ?? []);
      if (shippedAt.length < c.refs.length) {
        continue;
      }
      if (c.run.state === 'deploy-held' && isHeldPastShip(readHeldAt(db, c.run.issue), shippedAt)) {
        res.held.push(c.run.issue);
        continue;
      }
      const prs = c.refs.map((ref) => buildShippedPR(states.get(ref)));
      const destination = (liveCheck: string | null) => (liveCheck === 'none' ? ('done' as const) : ('live-check' as const));
      if (dryRun) {
        const to = destination(c.run.live_check);
        res.moved.push({ issue: c.run.issue, to, prs });
        continue;
      }
      const moved = db
        .transaction((): ShipMove['to'] | null => {
          // The run may have changed while GitHub was asked: look again.
          const now0 = db.query('SELECT * FROM runs WHERE issue = ?').get(c.run.issue) as Run | null;
          if (!now0 || !SHIPPABLE.includes(now0.state)) return null;
          if (now0.state === 'deploy-held' && isHeldPastShip(readHeldAt(db, c.run.issue), shippedAt)) {
            return null;
          }
          const cur = prsOf(c.run.issue);
          if (cur.some((p) => p.state === 'open') || cur.filter((p) => p.state === 'merged').map((p) => p.ref).join() !== c.refs.join()) return null;
          // Decide the destination from the live_check read here, not the one read before GitHub was asked.
          const to = destination(now0.live_check);
          const where = [...new Set(prs.map((pr) => formatShippedAt(pr.tag)))].join(', ');
          const done = to === 'done';
          setState(db, c.run.issue, to, { next: done ? `Shipped ${where}; no live check owed.` : `Shipped ${where}: run the live check, then hq run done ${c.run.issue}.`, waitsOn: null, note: done ? `Shipped ${where}` : null }, ACTOR);
          logEvent(db, 'run', c.run.issue, 'shipped', ACTOR, now0.state, to, { prs });
          return to;
        })
        .immediate();
      if (moved) {
        res.moved.push({ issue: c.run.issue, to: moved, prs });
      }
    }
    if (!dryRun && res.moved.length > 0) {
      tellShipped(db, res.moved);
    }
  };
  if (dryRun) {
    moveShipped();
  } else {
    db.transaction(moveShipped).immediate();
  }

  if (!dryRun) {
    recordErrors(db, res.errors);
  }
  return res;
}

async function releasesOf(run: Runner, repo: string, src: Source, at: Date): Promise<Release[]> {
  return match(src)
    .with({ kind: 'releases' }, (source) => readTaggedReleases(run, repo, source.tag))
    .with({ kind: 'packages' }, () => readPackageReleases(run, repo))
    .with({ kind: 'ref' }, (source) => readMovingTag(run, repo, source.ref, at))
    .with({ kind: 'build' }, { kind: 'merge' }, (source) => {
      throw new Error(`${repo} has a ${source.kind} source, which lists no releases`);
    })
    .exhaustive();
}

async function readTaggedReleases(run: Runner, repo: string, tag: RegExp): Promise<Release[]> {
  const out = await gh(run, ['api', `repos/${OWNER}/${repo}/releases?per_page=30`, '--jq', '[.[] | {tag_name, draft, prerelease, published_at}]'], `releases of ${repo}`);
  let raw: unknown;
  try {
    raw = JSON.parse(out);
  } catch {
    throw new HqError('bad_releases', `releases of ${repo} are not JSON`);
  }
  return parseReleases(raw, tag);
}

async function readMovingTag(run: Runner, repo: string, ref: string, at: Date): Promise<Release[]> {
  const out = await gh(run, ['api', `repos/${OWNER}/${repo}/git/ref/tags/${ref}`], `tag ${ref} of ${repo}`);
  let raw: { object?: { sha?: unknown } } | null;
  try {
    raw = JSON.parse(out);
  } catch {
    throw new HqError('bad_releases', `tag ${ref} of ${repo} is not JSON`);
  }
  if (typeof raw?.object?.sha !== 'string' || !HEX40.test(raw.object.sha)) {
    throw new HqError('bad_releases', `tag ${ref} of ${repo} has no commit`);
  }
  return [{ tag: ref, at: iso(at) }];
}

// One message per recipient per pass. Live-check runs go to HQ_LIVECHECK_TO (z-qa alone since 0.33.1,
// unless set); runs closed with no check owed go to z-delivery only.
function tellShipped(db: Database, moved: ShipMove[]): void {
  const live = moved.filter((m) => m.to === 'live-check');
  const done = moved.filter((m) => m.to === 'done');
  const liveTo = liveCheckRecipients();
  const doneTo = [roleName('orchestrator')];
  const seq = logEvent(db, 'hq', 'releases', 'moved', ACTOR, null, null, { runs: moved.map((m) => ({ issue: m.issue, to: m.to })) });
  for (const target of new Set([...liveTo, ...doneTo])) {
    const text = shippedText(liveTo.includes(target) ? live : [], doneTo.includes(target) ? done : []);
    // A topic of its own per pass: an unsent list must never replace an earlier unsent one.
    if (text) enqueue(db, seq, target, text, `run-shipped:${seq}`);
  }
}

function recordErrors(db: Database, errors: string[]): void {
  const next = errors.length ? JSON.stringify(errors.slice(0, 20)) : null;
  if (next === getMeta(db, ERRORS)) return;
  setMeta(db, ERRORS, next);
  if (next) logEvent(db, 'hq', 'releases', 'error', ACTOR, null, null, { errors: errors.slice(0, 20) });
}
