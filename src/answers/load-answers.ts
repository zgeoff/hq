import type { Database } from 'bun:sqlite';
import { getAsk } from '../asks/get-ask.ts';
import { findSubjectLink } from '../find-subject-link.ts';
import type { ItemOption } from '../parse-item-input.ts';
import { parseStoredExtras } from '../parse-stored-extras.ts';
import type { ConsoleReview } from '../record-console-review.ts';
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
    return [{ source: 'ask', id: ask.id, kind: ask.kind, title: ask.title, issues: ask.issues, session: ask.for_session, ...parsePickedOption(data.answer, loadRoundOptions(db, r)), ref: null, via: r.actor, at: r.at }];
  });
}

// The options the ask showed when this answer came: its last `item` event before the answer, so
// an answer from an earlier round is read against that round's options, not the current ones.
function loadRoundOptions(db: Database, answer: AnswerEvent): ItemOption[] {
  const row = db.query(`SELECT data FROM events WHERE subject = 'ask' AND subject_id = ? AND action = 'item' AND seq < ? ORDER BY seq DESC LIMIT 1`).get(answer.id, answer.seq) as { data: string } | null;
  return row === null ? [] : (parseStoredExtras((JSON.parse(row.data) as { item: string }).item)?.options ?? []);
}

function loadReviewAnswers(db: Database, window: AnswerWindow): Answer[] {
  const rows = db.query(`SELECT seq, subject_id AS id, actor, data, at FROM events WHERE subject = 'unblock' AND action = 'console-review' AND at >= ? AND at < ? ORDER BY seq`).all(window.from, window.to) as AnswerEvent[];
  return rows.flatMap((r) => {
    const data = JSON.parse(r.data) as { note: string | null; review: ConsoleReview },
      item = getUnblock(db, r.id);
    if (item === null) {
      return [];
    }
    return [{ source: 'review', id: item.id, kind: 'review', title: item.title ?? item.task, issues: item.unblocks.map((u) => u.issue), session: item.added_by, picked: REVIEW_LABELS[data.review], stuPick: null, words: data.note, ref: findSubjectLink(item)?.url ?? null, via: r.actor, at: r.at }];
  });
}

function loadTypedAnswers(db: Database, window: AnswerWindow): Answer[] {
  const rows = db.query('SELECT * FROM typed WHERE at >= ? AND at < ? ORDER BY id').all(window.from, window.to) as Typed[];
  return rows.map((t) => ({ source: 'typed', id: String(t.id), kind: t.source_kind, title: null, issues: [], session: t.to_name ?? t.to_session, picked: null, stuPick: null, words: t.text, ref: typedSource(t), via: t.typed_by, at: t.at }));
}
