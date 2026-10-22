import type { Database } from 'bun:sqlite';
import { fleetIds } from '../atc/fleet-ids.ts';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { owner } from '../owner.ts';
import { checkQuietPoint } from './check-quiet-point.ts';
import { findLiveSession } from './find-live-session.ts';
import { parseStaleCommit } from './parse-stale-commit.ts';
import { parseMessageReply } from './parse-message-reply.ts';
import type { MessageLookup, MessageReply } from './parse-message-reply.ts';
import { pickAskedOutcome } from './pick-asked-outcome.ts';
import type { AskedAnswer, AskedOutcome } from './pick-asked-outcome.ts';
import { promptDrift } from './prompt-drift.ts';
import { readTranscriptLines } from './read-transcript-lines.ts';
import { readScheduledRestarts } from './read-scheduled-restarts.ts';
import { recordStaleSince } from './record-stale-since.ts';
import { refreshSchema } from './refresh-schema.ts';
import type { RefreshMap } from './refresh-schema.ts';
import { restartStaleSession } from './restart-stale-session.ts';
import { sendSaveRequest } from './send-save-request.ts';
import { writeFleetRefresh } from './write-fleet-refresh.ts';
import { STALE_LIMITS } from './stale-limits.ts';
import type { StaleSinceMap } from './stale-since-schema.ts';
import type { FleetClient, FleetEntry, FleetSession, PromptDrift, RestartCause, StaleOps } from './types.ts';

export interface StaleTickOptions {
  fleet: FleetEntry[];
  actor: string;
  selfSessionID: string | undefined;
}

export interface RestartedSession {
  name: string;
  cause: RestartCause;
}

type Entry = RefreshMap[string];

interface StalePass {
  db: Database;
  client: FleetClient & StaleOps;
  opts: StaleTickOptions;
  time: Date;
  sessions: Record<string, FleetSession>;
  drift: Record<string, PromptDrift>;
  stale: StaleSinceMap;
  scheduled: Record<string, string>;
  refresh: RefreshMap;
  restarted: RestartedSession[];
  acted: boolean;
}

// A session the pass may act on, and why: its prompt has read stale for over two hours, or a
// scheduled restart is due. A session already asked keeps the cause it was asked for.
interface StaleTurn {
  entry: FleetEntry;
  session: FleetSession;
  cause: RestartCause;
  held: Entry | undefined;
}

// One pass of the stale restart, a state machine per declared session kept in meta fleet_refresh.
// Stale for over two hours, or due a scheduled restart, a session is asked to save at a quiet
// moment; on `saved` it is stopped, unpinned and forgotten, and ensure spawns it from main. One
// ask or restart per pass.
export async function runStaleRestartTick(db: Database, client: FleetClient & StaleOps, opts: StaleTickOptions): Promise<RestartedSession[]> {
  const pass = await readStalePass(db, client, opts);
  removeSettledEntries(pass);
  for (const entry of isQuiet(pass.time) ? [] : opts.fleet) {
    await runIsolatedStep(pass, entry);
  }
  writeFleetRefresh(db, pass.refresh);
  return pass.restarted;
}

async function readStalePass(db: Database, client: FleetClient & StaleOps, opts: StaleTickOptions): Promise<StalePass> {
  const view = await readFleetView(db, client, opts.fleet);
  const time = now();
  return {
    db,
    client,
    opts,
    time,
    sessions: view.sessions,
    drift: view.drift,
    stale: recordStaleSince(db, view.drift, toLiveIDs(view.sessions)),
    scheduled: await readScheduledRestarts({ db, transcripts: { lines: readTranscriptLines } }, opts.fleet, view.sessions, time.getTime()),
    refresh: metaJson(db, 'fleet_refresh', refreshSchema, {}),
    restarted: [],
    acted: false,
  };
}

async function readFleetView(
  db: Database,
  client: FleetClient & StaleOps,
  fleet: FleetEntry[],
): Promise<{ sessions: Record<string, FleetSession>; drift: Record<string, PromptDrift> }> {
  const all = await client.sessions(),
    known = fleetIds(db),
    sessions: Record<string, FleetSession> = {};
  if (!Array.isArray(all)) {
    throw new HqError('atc_bad_answer', 'atc returned no session list; no stale restart');
  }
  for (const entry of fleet) {
    const found = findLiveSession(entry.name, all, known);
    if (found) {
      sessions[entry.name] = found;
    }
  }
  return { sessions, drift: await promptDrift({ prompt: (id) => readPromptOf(client, id) }, fleet, all, known) };
}

async function readPromptOf(client: StaleOps, id: string): Promise<string | undefined> {
  const details = await client.details(id);
  return details.prompt ?? undefined;
}

function toLiveIDs(sessions: Record<string, FleetSession>): Record<string, string> {
  return Object.fromEntries(Object.entries(sessions).map(([name, session]) => [name, session.id]));
}

// A restart an earlier pass left unfinished is a skip when its session is still there, and gone
// when it is not. An entry for another session id, or a stale-prompt entry whose prompt is now
// current, is dropped. A scheduled entry stays until the session id changes.
function removeSettledEntries(pass: StalePass): void {
  for (const [name, entry] of Object.entries(pass.refresh)) {
    const current = pass.sessions[name];
    if (entry.phase === 'restarting') {
      if (current) {
        pass.refresh[name] = buildSkip(entry, pass.time);
      } else {
        delete pass.refresh[name];
      }
    } else if (current && (current.id !== entry.sessionId || (entry.scheduled === undefined && pass.drift[name]?.state === 'current'))) {
      delete pass.refresh[name];
    }
  }
}

async function runIsolatedStep(pass: StalePass, entry: FleetEntry): Promise<void> {
  try {
    await runSessionStep(pass, entry);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logEvent(pass.db, 'hq', 'fleet', 'stale-restart-failed', pass.opts.actor, null, null, { name: entry.name, error: reason });
  }
}

async function runSessionStep(pass: StalePass, entry: FleetEntry): Promise<void> {
  const turn = findStaleTurn(pass, entry);
  if (!turn) {
    return;
  }
  if (isExcluded(pass, turn)) {
    delete pass.refresh[entry.name];
    return;
  }
  if (turn.held?.phase === 'asked') {
    await runAskedStep(pass, turn, turn.held);
    return;
  }
  if (!pass.acted && isAskable(pass, turn)) {
    await runAskStep(pass, turn);
  }
}

function findStaleTurn(pass: StalePass, entry: FleetEntry): StaleTurn | null {
  const session = pass.sessions[entry.name];
  const held = pass.refresh[entry.name];
  if (!session) {
    return null;
  }
  const cause = findCause(pass, entry.name, session, held);
  return cause ? { entry, session, cause, held } : null;
}

function findCause(pass: StalePass, name: string, session: FleetSession, held: Entry | undefined): RestartCause | null {
  const stale = findStaleCause(pass, name, session);
  const scheduled = pass.scheduled[name];
  if (held?.phase === 'asked') {
    return held.scheduled === undefined ? (stale?.cause ?? null) : { kind: 'scheduled', why: held.scheduled };
  }
  if (stale && pass.time.getTime() - stale.sinceMs > STALE_LIMITS.staleMs) {
    return stale.cause;
  }
  return scheduled === undefined ? null : { kind: 'scheduled', why: scheduled };
}

// The stale-prompt cause, when the session reads stale and hq has seen it stale since `sinceMs`.
function findStaleCause(pass: StalePass, name: string, session: FleetSession): { cause: RestartCause; sinceMs: number } | null {
  const reading = pass.drift[name];
  const since = pass.stale[name];
  if (reading?.state !== 'stale' || !since || since.sessionId !== session.id) {
    return null;
  }
  return { cause: { kind: 'stale', commit: since.commit, latest: parseStaleCommit(reading.since) }, sinceMs: Date.parse(since.at) };
}

function isExcluded(pass: StalePass, turn: StaleTurn): boolean {
  return turn.entry.roles?.includes('owner') === true || turn.session.id === pass.opts.selfSessionID;
}

function isAskable(pass: StalePass, turn: StaleTurn): boolean {
  return turn.held?.retryAt === undefined || pass.time.getTime() >= Date.parse(turn.held.retryAt);
}

async function runAskStep(pass: StalePass, turn: StaleTurn): Promise<void> {
  if ((await readBusyReason(pass, turn.session)) !== null) {
    return;
  }

  // The request and its asked phase commit together, so a stop between them cannot leave a sent
  // request whose answer the next pass does not track.
  pass.db
    .transaction(() => {
      const eventSeq = sendSaveRequest(pass.db, turn.entry.name, turn.session.id, turn.cause);
      pass.refresh[turn.entry.name] = {
        sessionId: turn.session.id,
        phase: 'asked',
        askedAt: iso(pass.time),
        eventSeq,
        skips: turn.held?.skips ?? 0,
        ...(turn.held?.reported ? { reported: true } : {}),
        ...(turn.cause.kind === 'scheduled' ? { scheduled: turn.cause.why } : {}),
      };
      writeFleetRefresh(pass.db, pass.refresh);
    })
    .immediate();
  pass.acted = true;
}

async function runAskedStep(pass: StalePass, turn: StaleTurn, asked: Entry): Promise<void> {
  const outcome = await readAskedOutcome(pass, turn.session, asked);
  if (outcome === 'wait' || (outcome === 'restart' && pass.acted)) {
    return;
  }
  if (outcome === 'skip') {
    recordSkip(pass, turn.entry.name, asked, turn.cause);
    return;
  }
  pass.acted = true;
  pass.refresh[turn.entry.name] = { ...asked, phase: 'restarting' };
  writeFleetRefresh(pass.db, pass.refresh);
  await runRestart(pass, turn, asked);
}

// A stale-prompt restart is logged as stale-restarted with its commit, a scheduled one as
// scheduled-restarted with its reason.
async function runRestart(pass: StalePass, turn: StaleTurn, asked: Entry): Promise<void> {
  const restart = match(turn.cause)
    .with({ kind: 'stale' }, (stale) => ({ action: 'stale-restarted', detail: { commit: stale.commit } }))
    .with({ kind: 'scheduled' }, (scheduled) => ({ action: 'scheduled-restarted', detail: { reason: scheduled.why } }))
    .exhaustive();
  const detail = { name: turn.entry.name, sessionId: turn.session.id, ...restart.detail };
  try {
    await restartStaleSession(pass.client, turn.session.id);
    pass.restarted.push({ name: turn.entry.name, cause: turn.cause });
    logEvent(pass.db, 'hq', 'fleet', restart.action, pass.opts.actor, null, null, detail);
  } catch (error) {
    logEvent(pass.db, 'hq', 'fleet', 'stale-restart-failed', pass.opts.actor, null, null, { ...detail, error: String((error as Error).message ?? error) });
    recordSkip(pass, turn.entry.name, asked, turn.cause);
  }
}

async function readBusyReason(pass: StalePass, session: FleetSession): Promise<string | null> {
  const details = await pass.client.details(session.id);
  return checkQuietPoint(pass.db, { id: session.id, name: session.name, state: session.state, lastActivityAt: details.lastActivityAt }, pass.time.getTime());
}

async function readAskedOutcome(pass: StalePass, session: FleetSession, asked: Entry): Promise<AskedOutcome> {
  const answer = await readAskedAnswer(pass, session, asked);
  return pickAskedOutcome({ answer, askedAtMs: Date.parse(asked.askedAt ?? iso(pass.time)), nowMs: pass.time.getTime() });
}

async function readAskedAnswer(pass: StalePass, session: FleetSession, asked: Entry): Promise<AskedAnswer> {
  const reply = await readAnswerFor(pass, session, asked);
  if (reply.kind !== 'saved') {
    return reply;
  }
  return { ...reply, busyReason: await readBusyReason(pass, session) };
}

async function readAnswerFor(pass: StalePass, session: FleetSession, asked: Entry): Promise<MessageReply> {
  const lookup = await readMessageLookup(pass, session, asked);
  return parseMessageReply(lookup);
}

async function readMessageLookup(pass: StalePass, session: FleetSession, asked: Entry): Promise<MessageLookup> {
  const row = pass.db.query('SELECT message_id FROM outbox WHERE event_seq = ? AND message_id IS NOT NULL').get(asked.eventSeq ?? -1) as { message_id: string } | null;
  if (!row) {
    return { kind: 'unsent' };
  }
  try {
    const got = await pass.client.message(row.message_id);
    return { kind: 'read', status: got.status, answer: got.answer, answeredAt: got.answeredAt };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logEvent(pass.db, 'hq', 'fleet', 'stale-answer-unread', pass.opts.actor, null, null, { name: session.name, sessionId: session.id, message: row.message_id, error: reason });
    return { kind: 'failed' };
  }
}

function buildSkip(entry: Entry, t: Date): Entry {
  const skips = entry.skips + 1,
    wait = Math.min(STALE_LIMITS.backoffMs * 2 ** (skips - 1), STALE_LIMITS.backoffMaxMs);
  return {
    sessionId: entry.sessionId,
    phase: 'idle',
    skips,
    retryAt: iso(new Date(t.getTime() + wait)),
    ...(entry.reported ? { reported: true } : {}),
    ...(entry.scheduled === undefined ? {} : { scheduled: entry.scheduled }),
  };
}

// After enough deferrals z-stu is told once; hq never restarts the session unasked.
function recordSkip(pass: StalePass, name: string, entry: Entry, cause: RestartCause): void {
  const skipped = buildSkip(entry, pass.time);
  pass.refresh[name] = skipped;
  if (skipped.skips >= STALE_LIMITS.reportAfterSkips && !skipped.reported) {
    sendDeferralReport(pass, name, skipped.skips, cause);
    pass.refresh[name] = { ...skipped, reported: true };
  }
}

function sendDeferralReport(pass: StalePass, name: string, skips: number, cause: RestartCause): void {
  const report = match(cause)
    .with({ kind: 'stale' }, (stale) => ({ detail: { commit: stale.commit }, text: `still runs a prompt that predates main ${stale.commit}` }))
    .with({ kind: 'scheduled' }, (scheduled) => ({ detail: { reason: scheduled.why }, text: `is due a scheduled restart (${scheduled.why})` }))
    .exhaustive();
  const seq = logEvent(pass.db, 'hq', 'fleet', 'stale-restart-deferred', pass.opts.actor, null, null, { name, ...report.detail, skips });
  enqueue(
    pass.db,
    seq,
    owner(),
    `hq fleet: ${name} ${report.text}; it has deferred its restart ${skips} times. hq restarts a session only after it says it has saved, so restart it yourself when it suits.`,
  );
}
