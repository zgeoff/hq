import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getAsk } from '../asks/get-ask.ts';
import { readRoundOptions } from '../asks/read-round-options.ts';
import { findSubjectLink } from '../find-subject-link.ts';
import { REVIEW_LABELS } from '../review-labels.ts';
import type { Typed } from '../typed/types.ts';
import { typedSource } from '../typed/typed-source.ts';
import { getUnblock } from '../unblock/get-unblock.ts';
import { parsePickedOption } from './parse-picked-option.ts';
import type { Answer, AnswerWindow } from './types.ts';

// Every answer in the window, oldest first. Ask answers come from the state events, one per round,
// so a re-asked call keeps each answer; the console's own `console-answer` event repeats one and is
// left out. A to-do's Done, Later or Skip is a task, not a decision, so it is not listed.
export function loadAnswers(db: Database, window: AnswerWindow): Answer[] {
  return [...loadAskAnswers(db, window), ...loadReviewAnswers(db, window), ...loadTypedAnswers(db, window)].toSorted((a, b) => a.at.localeCompare(b.at));
}

interface AnswerEvent {
  seq: number;
  id: string;
  actor: string;
  data: string;
  at: string;
}

function loadAskAnswers(db: Database, window: AnswerWindow): Answer[] {
  const rows = db.query(`SELECT seq, subject_id AS id, actor, data, at FROM events WHERE subject = 'ask' AND action IN ('answered', 'answered-unopened') AND at >= ? AND at < ? ORDER BY seq`).all(window.from, window.to) as AnswerEvent[];
  return rows.flatMap((r) => {
    const ask = getAsk(db, r.id),
      data = JSON.parse(r.data) as { answer: string };
    if (ask === null) {
      return [];
    }
    const round = loadRoundFacts(db, r) ?? (isChangedSince(db, 'ask', r) ? UNKNOWN_ROUND : { title: ask.title, issues: ask.issues, forSession: ask.for_session });
    return [{ source: 'ask', id: ask.id, kind: ask.kind, title: round.title, issues: round.issues, session: round.forSession, ...parsePickedOption(data.answer, readRoundOptions(db, r.id, r.seq)), ref: null, via: r.actor, at: r.at }];
  });
}

const RoundFactsSchema = z.object({ title: z.string(), issues: z.array(z.string()), forSession: z.string().nullable() });

type RoundFacts = { title: string | null; issues: string[]; forSession: string | null };

const EventDataSchema = z.object({ data: z.string() }).nullable();

// What an answer whose round facts are lost shows: the ask changed after it, so its current title,
// issues and session may belong to a later round.
const UNKNOWN_ROUND: RoundFacts = { title: null, issues: [], forSession: null };

// The actions that can change an ask's or an unblock item's title, issues, session or link.
const CHANGE_ACTIONS: Record<'ask' | 'unblock', string[]> = { ask: ['added', 'updated', 'reasked', 'requeued'], unblock: ['added', 'item', 'reopened', 'updated'] };

// True when an event after this answer may have changed what the item stands for, so the item as it
// stands now no longer tells what the owner answered.
function isChangedSince(db: Database, subject: 'ask' | 'unblock', answer: AnswerEvent): boolean {
  const actions = CHANGE_ACTIONS[subject];
  return db.query(`SELECT 1 FROM events WHERE subject = ? AND subject_id = ? AND seq > ? AND action IN (${actions.map(() => '?').join(', ')}) LIMIT 1`).get(subject, answer.id, answer.seq, ...actions) !== null;
}

// The title, issues and session the ask held when this answer came: kept on the answer, or else
// from the last change before it; null for an ask whose events predate those facts, which is then
// read as it stands now unless it changed after the answer.
function loadRoundFacts(db: Database, answer: AnswerEvent): RoundFacts | null {
  const kept = RoundFactsSchema.safeParse(JSON.parse(answer.data));
  if (kept.success) {
    return kept.data;
  }
  const row = EventDataSchema.parse(db.query(`SELECT data FROM events WHERE subject = 'ask' AND subject_id = ? AND action IN ('added', 'updated', 'reasked', 'requeued') AND json_extract(data, '$.title') IS NOT NULL AND seq < ? ORDER BY seq DESC LIMIT 1`).get(answer.id, answer.seq));
  return row === null ? null : RoundFactsSchema.parse(JSON.parse(row.data));
}

const ReviewFactsSchema = z.object({ title: z.string(), issues: z.array(z.string()), session: z.string(), ref: z.string().nullable() });

const ReviewDataSchema = z.object({ note: z.string().nullable(), review: z.enum(['lgtm', 'changes', 'later', 'reject']), facts: ReviewFactsSchema.optional() });

function loadReviewAnswers(db: Database, window: AnswerWindow): Answer[] {
  const rows = db.query(`SELECT seq, subject_id AS id, actor, data, at FROM events WHERE subject = 'unblock' AND action = 'console-review' AND at >= ? AND at < ? ORDER BY seq`).all(window.from, window.to) as AnswerEvent[];
  return rows.flatMap((r) => {
    const data = ReviewDataSchema.parse(JSON.parse(r.data));
    const item = getUnblock(db, r.id);
    if (item === null) {
      return [];
    }

    // A review from before its facts were kept is read against the item as it stands now, unless the
    // item changed after it: its title, issues, session and PR are then unknown.
    const facts = data.facts ?? (isChangedSince(db, 'unblock', r) ? { title: null, issues: [], session: null, ref: null } : { title: item.title ?? item.task, issues: item.unblocks.map((unblock) => unblock.issue), session: item.added_by, ref: findSubjectLink(item)?.url ?? null });
    return [{ source: 'review', id: item.id, kind: 'review', title: facts.title, issues: facts.issues, session: facts.session, picked: REVIEW_LABELS[data.review], stuPick: null, words: data.note, ref: facts.ref, via: r.actor, at: r.at }];
  });
}

function loadTypedAnswers(db: Database, window: AnswerWindow): Answer[] {
  const rows = db.query('SELECT * FROM typed WHERE at >= ? AND at < ? ORDER BY id').all(window.from, window.to) as Typed[];
  return rows.map((t) => ({ source: 'typed', id: String(t.id), kind: t.source_kind, title: null, issues: [], session: t.to_name ?? t.to_session, picked: null, stuPick: null, words: t.text, ref: typedSource(t), via: t.typed_by, at: t.at }));
}
