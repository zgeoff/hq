import type { Database } from 'bun:sqlite';
import { isQuiet } from '../clock/is-quiet.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { owner } from '../owner.ts';
import type { AskState } from '../transitions/ask-states.ts';
import { ASK_TRANSITIONS } from '../transitions/ask-transitions.ts';
import { checkAsk } from '../transitions/check-ask.ts';
import { getAsk } from './get-ask.ts';
import { requireAsk } from './require-ask.ts';
import { sendNoticeIfOther as notifyIfOther } from './send-notice-if-other.ts';
import type { AddInput, AddResult, Ask } from './types.ts';

// "call ready" and "proposal: ...". Idempotent: the same id and question never
// reach the owner twice. A changed question on a settled id starts a new round.
export function addAsk(db: Database, input: AddInput): AddResult {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(input.id)) throw new HqError('bad_args', `id "${input.id}" must be a slug: letters, digits, . _ -`);
  for (const f of ['title', 'question', 'body'] as const) {
    if (!input[f].trim()) throw new HqError('bad_args', `${f} must not be empty`);
  }
  return db
    .transaction((): AddResult => {
      const t = iso(now());
      const prev = getAsk(db, input.id);
      const issues = JSON.stringify(input.issues);
      if (!prev) {
        db.query(
          `INSERT INTO asks (id, kind, title, question, body, issues, filed_by, for_session, send_order, state, queued_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
        ).run(input.id, input.kind, input.title, input.question, input.body, issues, input.actor, input.forSession, input.order ?? null, t, t, t);
        const seq = logEvent(db, 'ask', input.id, 'added', input.actor, null, 'queued', { body: input.body });
        notifyIfOther(db, { seq, target: owner(), actor: input.actor, text: `${input.kind} ready: ${input.id}: ${input.title}. Read it with: hq ${input.kind} show ${input.id}`, topic: `ready:${input.id}` });
        markTold(db, input.id, input.actor);
        return { ask: getAsk(db, input.id)!, result: 'added' };
      }
      if (prev.kind !== input.kind) throw new HqError('kind_conflict', `${input.id} is a ${prev.kind}, not a ${input.kind}`);

      const sameQuestion = sameText(prev.question, input.question);
      const settled = prev.state === 'answered' || prev.state === 'applied';

      if (prev.state === 'open') {
        if (!sameQuestion) {
          updateIssuesOnly(db, prev, input, t);
          return { ask: requireAsk(db, prev.id), result: 'noop', note: 'open with the owner: question left as sent (issues updated); close it first to change it' };
        }
        updateText(db, prev, input, t);
        return { ask: getAsk(db, prev.id)!, result: changed(prev, input) ? 'updated' : 'noop' };
      }
      if (settled && sameQuestion) {
        updateIssuesOnly(db, prev, input, t);
        return { ask: getAsk(db, prev.id)!, result: 'noop', note: `already ${prev.state}: not sent again` };
      }
      if (!sameQuestion && (ASK_TRANSITIONS.reasked.from as readonly AskState[]).includes(prev.state)) {
        checkAsk(prev.id, 'reasked', prev.state);
        db.query(
          `UPDATE asks SET title=?, question=?, body=?, issues=?, for_session=?, send_order=?, item=NULL, state='queued', round=round+1, due_at=NULL,
             answer=NULL, answered_at=NULL, applied_to=NULL, applied_note=NULL, applied_at=NULL, close_reason=NULL,
             opened_at=NULL, queued_at=?, updated_at=? WHERE id=?`,
        ).run(input.title, input.question, input.body, issues, input.forSession ?? prev.for_session, orderOf(prev, input), t, t, prev.id);
        const seq = logEvent(db, 'ask', prev.id, 'reasked', input.actor, prev.state, 'queued', { body: input.body, round: prev.round + 1 });
        notifyIfOther(db, { seq, target: owner(), actor: input.actor, text: `${input.kind} ready (new question): ${prev.id}: ${input.title}. Read it with: hq ${input.kind} show ${prev.id}`, topic: `ready:${prev.id}` });
        markTold(db, prev.id, input.actor);
        return { ask: getAsk(db, prev.id)!, result: 'reasked' };
      }
      if (prev.state === 'closed' && prev.answer !== null) {
        // The owner answered it before it closed: the same question never goes back to them.
        updateIssuesOnly(db, prev, input, t);
        return { ask: getAsk(db, prev.id)!, result: 'noop', note: 'answered, then closed: not sent again' };
      }
      if ((ASK_TRANSITIONS.requeued.from as readonly AskState[]).includes(prev.state)) {
        checkAsk(prev.id, 'requeued', prev.state);
        updateText(db, prev, input, t);
        // A skipped answer was not applied because the issue changed: the re-prepared
        // call is a new round. The old answer stays in the event log.
        const newRound = prev.answer !== null;
        db.query(
          `UPDATE asks SET state='queued', close_reason=NULL, opened_at=NULL, queued_at=?, updated_at=?
             ${newRound ? ', round=round+1, answer=NULL, answered_at=NULL' : ''} WHERE id=?`,
        ).run(t, t, prev.id);
        const seq = logEvent(db, 'ask', prev.id, 'requeued', input.actor, prev.state, 'queued', {
          body: input.body,
          ...(newRound ? { round: prev.round + 1, previous_answer: prev.answer } : {}),
        });
        notifyIfOther(db, { seq, target: owner(), actor: input.actor, text: `${input.kind} ready again: ${prev.id}: ${input.title}. Read it with: hq ${input.kind} show ${prev.id}`, topic: `ready:${prev.id}` });
        markTold(db, prev.id, input.actor);
        return { ask: getAsk(db, prev.id)!, result: 'requeued' };
      }
      // queued or later: refresh the text in place, keep its place in line.
      updateText(db, prev, input, t);
      return { ask: getAsk(db, prev.id)!, result: changed(prev, input) ? 'updated' : 'noop' };
    })
    .immediate();
}

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');

const orderOf = (prev: Ask, input: AddInput) => (input.order === undefined ? prev.send_order : input.order);

function changed(prev: Ask, input: AddInput): boolean {
  return (
    prev.send_order !== orderOf(prev, input) ||
    prev.for_session !== (input.forSession ?? prev.for_session) ||
    prev.title !== input.title ||
    prev.question !== input.question ||
    prev.body !== input.body ||
    JSON.stringify(prev.issues) !== JSON.stringify(input.issues)
  );
}

// New text drops the structured fields, which describe the old text: the console shows an item's
// fields over its body. A caller that files fields writes them again after this.
function updateText(db: Database, prev: Ask, input: AddInput, t: string): void {
  if (!changed(prev, input)) return;
  const newText = prev.title !== input.title || prev.question !== input.question || prev.body !== input.body;
  const clearItem = newText ? 1 : 0;
  db.query(`UPDATE asks SET title=?, question=?, body=?, issues=?, for_session=?, send_order=?, item=CASE WHEN ? THEN NULL ELSE item END, updated_at=? WHERE id=?`).run(
    input.title,
    input.question,
    input.body,
    JSON.stringify(input.issues),
    input.forSession ?? prev.for_session,
    orderOf(prev, input),
    clearItem,
    t,
    prev.id,
  );
  logEvent(db, 'ask', prev.id, 'updated', input.actor, prev.state, prev.state, { body: input.body, order: orderOf(prev, input) });
}

function updateIssuesOnly(db: Database, prev: Ask, input: AddInput, t: string): void {
  if (JSON.stringify(prev.issues) === JSON.stringify(input.issues)) return;
  db.query(`UPDATE asks SET issues=?, updated_at=? WHERE id=?`).run(JSON.stringify(input.issues), t, prev.id);
  logEvent(db, 'ask', prev.id, 'updated', input.actor, prev.state, prev.state, { issues: input.issues });
}

// The owner knows about an item it filed itself, or one it heard about while
// the item could open: the reminder below then has nothing to add.
function markTold(db: Database, id: string, actor: string): void {
  if (actor === owner() || !isQuiet(now())) setMeta(db, `told:${id}`, now().toISOString());
}
