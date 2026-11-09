import type { Database } from 'bun:sqlite';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { logEvent } from '../log-event.ts';
import { owner } from '../owner.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { dbPath } from '../db/db-path.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { strMap } from '../db/str-map.ts';
import { HqError } from '../errors.ts';
import { addNews } from '../news/add-news.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { readPrompt } from '../prompts/read-prompt.ts';
import { cleanEnv } from '../runner/clean-env.ts';
import { hqSetenv } from '../runner/hq-setenv.ts';
import { checkFolderTrust } from '../trust/check-folder-trust.ts';
import { getClaudeJson } from '../trust/get-claude-json.ts';
import { atcStateDir } from '../wake/atc-state-dir.ts';
import { wakeAdd } from '../wake/wake-add.ts';
import { wakeList } from '../wake/wake-list.ts';
import { wakeRemove } from '../wake/wake-remove.ts';
import { checkRcMarker as rcEvaluate } from './check-rc-marker.ts';
import { claimMissing } from './claim-missing.ts';
import { declaredFleet } from './declared-fleet.ts';
import { formatStep as sayStep } from './format-step.ts';
import { getHome as HOME } from './get-home.ts';
import { hasStaleOps } from './has-stale-ops.ts';
import { HELD } from './held.ts';
import { loadRcPending as rcPending } from './load-rc-pending.ts';
import { pickStepsToTell } from './pick-steps-to-tell.ts';
import { recordStaleRestarts } from './record-stale-restarts.ts';
import { runStaleRestartTick } from './run-stale-restart-tick.ts';
import type { RestartedSession } from './run-stale-restart-tick.ts';
import type { EnsureStep, FleetClient, FleetEntry, RcDeps, SpawnRequest } from './types.ts';
import { updateRcPending as setPending } from './update-rc-pending.ts';
import { toErrorMessage } from '../to-error-message.ts';

export async function ensureFleet(db: Database, client: FleetClient, opts: { dryRun: boolean; actor: string; fleet?: FleetEntry[]; now?: string[]; rc?: RcDeps }): Promise<EnsureStep[]> {
  // One ensure at a time: two that overlap could each read "missing" and spawn (a --now beside
  // the timer).
  if (opts.dryRun) return ensureOnce(db, client, opts);
  const lease = takeLease(db, opts.actor);
  try {
    const restarted = await tryStaleRestart(db, client, opts);
    let steps: EnsureStep[];
    try {
      steps = await ensureOnce(db, client, { ...opts, now: [...(opts.now ?? []), ...restarted.map((r) => r.name)] });
    } catch (error) {
      recordStaleRestarts(db, restarted, null, opts.actor);
      throw error;
    }
    recordStaleRestarts(db, restarted, steps, opts.actor);
    return steps;
  } finally {
    dropLease(db, lease);
  }
}

interface StaleRestartOptions {
  actor: string;
  fleet?: FleetEntry[];
}

async function tryStaleRestart(db: Database, client: FleetClient, opts: StaleRestartOptions): Promise<RestartedSession[]> {
  if (!hasStaleOps(client)) {
    return [];
  }
  try {
    return await runStaleRestartTick(db, client, { fleet: opts.fleet ?? declaredFleet(db), actor: opts.actor, selfSessionID: process.env['ATC_SESSION_ID'] });
  } catch (error) {
    logEvent(db, 'hq', 'fleet', 'stale-restart-failed', opts.actor, null, null, { error: toErrorMessage(error) });
    return [];
  }
}

const LEASE = 'fleet_ensure_lease';
const LEASE_MS = 5 * 60_000;

function takeLease(db: Database, actor: string): string {
  return db
    .transaction(() => {
      const held = metaJson(db, LEASE, z.object({ token: z.string(), by: z.string(), until: z.number() }).nullable(), null);
      if (held && held.until > Date.now()) throw new HqError('busy', `another hq fleet ensure is running (${held.by}); nothing spawned. Try again in a minute.`);
      const token = `${actor}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMeta(db, LEASE, JSON.stringify({ token, by: actor, until: Date.now() + LEASE_MS }));
      return token;
    })
    .immediate();
}

function dropLease(db: Database, token: string): void {
  db.transaction(() => {
    const held = metaJson(db, LEASE, z.object({ token: z.string() }).nullable(), null);
    if (held?.token === token) setMeta(db, LEASE, null);
  }).immediate();
}
const FLEET_UNPINNED = 'fleet_unpinned';

async function ensureOnce(db: Database, client: FleetClient, opts: { dryRun: boolean; actor: string; fleet?: FleetEntry[]; now?: string[]; rc?: RcDeps }): Promise<EnsureStep[]> {
  // A missing name waits before a spawn (a restore after a daemon restart keeps its id); a z- session
  // doesn't sleep for an hour, so a session atc still means to run is taken as dead after that.
  const GRACE_MIN = 10;
  const INTENDED_MAX_MIN = 60;
  const UNLISTED_GRACE_MIN = 30;
  const startedAt = now();
  const fleet = opts.fleet ?? declaredFleet(db);
  const hurry = new Set(opts.now ?? []);
  const unknown = [...hurry].filter((n) => !fleet.some((e) => e.name === n));
  if (unknown.length) throw new HqError('bad_args', `--now names ${unknown.join(', ')}, not in the declared fleet (${fleet.map((e) => e.name).join(', ')}); nothing spawned`);
  const all = await client.sessions();
  const missing = metaJson(db, 'fleet_missing_since', strMap, {});
  const known = metaJson(db, 'fleet_ids', strMap, {});

  const unpinned = metaJson(db, FLEET_UNPINNED, strMap, {});
  const knownIds = (name: string) => [...new Set([known[name], ...wakeList(db).filter((w) => w.name === name).map((w) => w.session_id)].filter((x): x is string => !!x))];
  // atc writes this record when a restart ends; the restore runs around then.
  let restartAt: number | null = null;
  try {
    restartAt = statSync(`${atcStateDir()}/restarts/last.json`).mtimeMs;
  } catch {}
  const steps: EnsureStep[] = [];
  const helpers: { name: string; step: EnsureStep }[] = [];
  for (const e of fleet) {
    const live = all.filter((s) => s.name === e.name && s.alive);
    if (live.length === 1) known[e.name] = live[0]!.id;
    if (live.length) {
      delete missing[e.name];
      const [only] = live;
      if (live.length === 1 && only) {
        const pinFailure = opts.dryRun ? null : await retryPin(client, unpinned, e.name, only.id);
        steps.push({ name: e.name, action: 'ok', detail: `${only.id.slice(0, 8)}${pinFailure ? `; still unpinned (${pinFailure}), so the next check pins it again` : ''}`, id: only.id });
      } else {
        steps.push({ name: e.name, action: 'duplicates', detail: `${live.length} live sessions share the name; hq stops none` });
      }
      continue;
    }
    // Its known session, under any name: live (renamed), or one atc still means to run (asleep, restoring).
    const ids = knownIds(e.name);
    const mine = all.filter((s) => ids.includes(s.id));
    const renamed = mine.find((s) => s.alive);
    if (renamed) {
      delete missing[e.name];
      steps.push({ name: e.name, action: 'ok', detail: `${renamed.id.slice(0, 8)}, now named ${renamed.name}; hq spawns none`, id: renamed.id });
      continue;
    }
    const missingSince = missing[e.name] ?? iso(startedAt);
    missing[e.name] = missingSince;
    const gone = (startedAt.getTime() - Date.parse(missingSince)) / 60_000;
    const intended = [...mine, ...all.filter((s) => s.name === e.name)].some((s) => s.lifecycle?.desired !== undefined && s.lifecycle.desired !== 'stop');
    const unlisted = ids.length > 0 && mine.length === 0;
    const grace = unlisted ? UNLISTED_GRACE_MIN : GRACE_MIN;
    const recentRestart = restartAt !== null && startedAt.getTime() - restartAt < GRACE_MIN * 60_000;
    const stillIntended = intended && gone < INTENDED_MAX_MIN;
    if (!hurry.has(e.name) && (gone < grace || stillIntended || recentRestart)) {
      const why = stillIntended
        ? `atc still means to run it (asleep or restoring; hq spawns after ${INTENDED_MAX_MIN} min)`
        : recentRestart
          ? 'the daemon restarted under 10 min ago'
          : `no live session for ${Math.floor(gone)} min (spawns at ${grace}${unlisted ? ': its known id is not in atc\'s list' : ''})`;
      steps.push({ name: e.name, action: 'waiting', detail: why });
      continue;
    }
    let prompt: string;
    try {
      if (!existsSync(e.cwd)) throw new HqError('no_cwd', `cwd ${e.cwd} is missing`);
      // An untrusted folder hangs the new session at Claude Code's trust dialog.
      const trust = checkFolderTrust(e.cwd);
      if (!trust.trusted) throw new HqError('untrusted_cwd', trust.why);
      prompt = readPrompt(e.prompt);
    } catch (err) {
      steps.push({ name: e.name, action: 'failed', detail: toErrorMessage(err) });
      continue;
    }
    if (opts.dryRun) {
      steps.push({ name: e.name, action: 'would spawn', detail: `in ${e.cwd}, model ${e.model}, prompt from ${e.prompt} (${prompt.length} chars)${hurry.has(e.name) ? ' (--now)' : ''}` });
      continue;
    }
    try {
      // One key per gap: a retry or an overlapping run replays the first spawn, never a second.
      missing[e.name] = claimMissing(db, e.name, missing[e.name]!);
      const id = await createFleetSession(client, e, prompt, `hq-fleet-${e.name}-${missing[e.name]}`);
      const pinFailure = await pinSession(client, id);
      if (pinFailure) {
        unpinned[e.name] = id;
        writeUnpinned(db, e.name, id);
      }
      if (e.wake) {
        for (const w of wakeList(db).filter((w) => w.name === e.name && w.session_id !== id)) wakeRemove(db, w.session_id, opts.actor);
        wakeAdd(db, { id, name: e.name }, null, opts.actor);
      }
      delete missing[e.name];
      known[e.name] = id;
      const step: EnsureStep = { name: e.name, action: 'spawned', detail: `${id.slice(0, 8)} after ${Math.floor(gone)} min without a live session${hurry.has(e.name) ? ' (--now)' : ''}${pinFailure ? `; the pin failed (${pinFailure}), so the next check pins it again` : ''}`, id };
      if (e.remoteControl) {
        setPending(db, e.name, { id, since: iso(startedAt) });
        helpers.push({ name: e.name, step });
      }
      steps.push(step);
    } catch (err) {
      steps.push({ name: e.name, action: 'failed', detail: toErrorMessage(err) });
    }
  }
  const rcReported = new Set<EnsureStep>();
  if (!opts.dryRun && opts.rc) {
    // The helper reads the known ids, so they are stored before it starts.
    if (helpers.length) setMeta(db, 'fleet_ids', JSON.stringify(known));
    for (const h of helpers) {
      const err = await startHelper(opts.rc, h.name);
      if (err) h.step.detail += `; the Remote Control helper did not start (${err}), so the next 5-minute check does it`;
    }

    // Each marker's report is queued as the marker ends, so ensure's own message leaves it out.
    const reported = await remoteControlTick(db, client, opts.rc, known, opts.actor);
    steps.push(...reported);
    reported.forEach((step) => rcReported.add(step));
  }
  db.transaction(() => {
    setMeta(db, 'fleet_missing_since', JSON.stringify(missing));
    if (!opts.dryRun) {
      setMeta(db, FLEET_UNPINNED, JSON.stringify(unpinned));
    }
    setMeta(db, 'fleet_ids', JSON.stringify(known));
    setMeta(db, 'fleet_last', JSON.stringify({ at: iso(startedAt), dryRun: opts.dryRun, steps }));
    const told = steps.filter((step) => !rcReported.has(step) && (step.action === 'spawned' || step.action === 'failed' || step.action === 'duplicates' || step.action === 'remote control'));
    if (!opts.dryRun && told.length) {
      const seq = logEvent(db, 'hq', 'fleet', 'ensured', opts.actor, null, null, { steps: told });
      const picked = pickStepsToTell(told);
      for (const step of picked.news) {
        addNews(db, { from: opts.actor, topic: 'other', text: `hq fleet: ${sayStep(step)}.`.replaceAll(/\s*[\r\n]+\s*/gu, ' ').slice(0, 400), issue: null, link: null, needsGeoff: false, tag: 'fleet-respawn' });
      }
      for (const urgent of picked.owner.filter((x) => x.urgent)) {
        enqueue(db, logEvent(db, 'hq', 'fleet', 'urgent', opts.actor, null, null, { step: urgent }), owner(), `hq fleet: ${sayStep(urgent)}.`);
      }
      if (picked.owner.length > 0) {
        const text = `hq fleet: ${picked.owner.map(sayStep).join('; ')}.`;
        if (isQuiet(startedAt)) {
          setMeta(db, 'fleet_held', JSON.stringify([...metaJson(db, 'fleet_held', HELD, []), { seq, text }]));
        } else {
          enqueue(db, seq, owner(), text);
        }
      }
    }
    if (!opts.dryRun && !isQuiet(startedAt)) {
      const held = metaJson(db, 'fleet_held', HELD, []);
      for (const h of held) enqueue(db, h.seq, owner(), `${h.text} (held over quiet hours)`);
      setMeta(db, 'fleet_held', null);
    }
  }).immediate();
  return steps;
}

async function remoteControlTick(db: Database, client: FleetClient, rc: RcDeps | undefined, known: Record<string, string>, actor: string): Promise<EnsureStep[]> {
  const steps: EnsureStep[] = [];
  if (!rc || !client.submit) return steps;
  for (const name of Object.keys(rcPending(db))) {
    const r = await rcEvaluate(db, { client, rc, name, known, actor, replaced: 'finish' });
    if (r.kind === 'done') steps.push(r.step);
  }
  return steps;
}

async function startHelper(rc: RcDeps, name: string): Promise<string | null> {
  const unit = `hq-rc-${name}-${Math.floor(Date.now() / 1000)}`;
  const path = `${HOME()}/.local/bin:${HOME()}/.bun/bin:/usr/local/bin:/usr/bin:/bin`;
  const cmd = [
    'systemd-run', '--user', `--unit=${unit}`, '--collect', '--quiet',
    `--setenv=PATH=${path}`, '--setenv=ATC_SESSION_ID=', '--setenv=ATC_SESSION_RECORD=',
    ...hqSetenv({ HQ_AS: 'hq-fleet', HQ_DB: resolve(dbPath()), HQ_CLAUDE_JSON: resolve(getClaudeJson()) }), ...rc.self, 'fleet', 'rc', name,
  ];
  try {
    const r = await rc.run(cmd, { env: cleanEnv() });
    return r.code === 0 ? null : (r.stderr || r.stdout).trim() || `exit ${r.code}`;
  } catch (e) {
    return toErrorMessage(e);
  }
}

async function retryPin(client: FleetClient, unpinned: Record<string, string>, name: string, id: string): Promise<string | null> {
  if (unpinned[name] !== id) {
    delete unpinned[name];
    return null;
  }
  const failure = await pinSession(client, id);
  if (!failure) {
    delete unpinned[name];
  }
  return failure;
}

async function pinSession(client: FleetClient, id: string): Promise<string | null> {
  try {
    await client.pin(id);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

// Plugin folders go only when the entry declares them, so an atc before 4.15 still spawns every
// other session.
async function createFleetSession(client: FleetClient, e: FleetEntry, prompt: string, idempotencyKey: string): Promise<string> {
  const request: SpawnRequest = { cwd: e.cwd, name: e.name, prompt, model: e.model, agent: 'claude', idempotencyKey, ...(e.pluginDirs ? { pluginDirs: e.pluginDirs } : {}) };
  const spawned = await client.spawn(request);
  return spawned.id;
}

// Stored at once, so a later step that throws before the run's last write cannot lose the retry.
function writeUnpinned(db: Database, name: string, id: string): void {
  db.transaction(() => {
    setMeta(db, FLEET_UNPINNED, JSON.stringify({ ...metaJson(db, FLEET_UNPINNED, strMap, {}), [name]: id }));
  }).immediate();
}
