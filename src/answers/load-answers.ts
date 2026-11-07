import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { getAsk } from '../asks/get-ask.ts';
import { readRoundOptions } from '../asks/read-round-options.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { findSubjectLink } from '../find-subject-link.ts';
import { kdb } from '../kdb.ts';
import { REVIEW_LABELS } from '../review-labels.ts';
import { TypedRowSchema } from '../typed/typed-row-schema.ts';
import { typedSource } from '../typed/typed-source.ts';
import { getUnblock } from '../unblock/get-unblock.ts';
import { parsePickedOption } from './parse-picked-option.ts';
import type { Answer, AnswerWindow } from './types.ts';

export function loadAnswers(db: Database, window: AnswerWindow): Answer[] {
  return [...loadAskAnswers(db, window), ...loadReviewAnswers(db, window), ...loadTypedAnswers(db, window)].toSorted((a, b) => a.at.localeCompare(b.at));
}

const AnswerEventSchema = buildRowSchema('events').pick({ seq: true, actor: true, data: true, at: true }).extend({ id: z.string() });
type AnswerEvent = z.output<typeof AnswerEventSchema>;

interface RoundFacts {
  title: string | null;
  issues: string[];
  forSession: string | null;
}

const UNKNOWN_ROUND: RoundFacts = { title: null, issues: [], forSession: null };

const AskAnswerData = z.object({ answer: z.string() });

function loadAskAnswers(db: Database, window: AnswerWindow): Answer[] {
  const query = kdb(db)
    .selectFrom('events')
    .select(['seq', 'subject_id as id', 'actor', 'data', 'at'])
    .where('subject', '=', 'ask')
    .where('action', 'in', ['answered', 'answered-unopened'])
    .where('at', '>=', window.from)
    .where('at', '<', window.to)
    .orderBy('seq')
    .compile();
  const rows = runSyncQuery(db, query, AnswerEventSchema);
  return rows.flatMap((r) => {
    const ask = getAsk(db, r.id);
    const data = AskAnswerData.parse(JSON.parse(r.data));
    if (ask === null) {
      return [];
    }
    const round = loadRoundFacts(db, r) ?? (isChangedSince(db, 'ask', r) ? UNKNOWN_ROUND : { title: ask.title, issues: ask.issues, forSession: ask.for_session });
    return [{ source: 'ask', id: ask.id, kind: ask.kind, title: round.title, issues: round.issues, session: round.forSession, ...parsePickedOption(data.answer, readRoundOptions(db, r.id, r.seq)), ref: null, via: r.actor, at: r.at }];
  });
}

const RoundFactsSchema = z.object({ title: z.string(), issues: z.array(z.string()), forSession: z.string().nullable() });

const EventDataSchema = z.object({ data: z.string() }).nullable();

const CHANGE_ACTIONS: Record<'ask' | 'unblock', string[]> = { ask: ['added', 'updated', 'reasked', 'requeued'], unblock: ['added', 'item', 'reopened', 'updated'] };

function isChangedSince(db: Database, subject: 'ask' | 'unblock', answer: AnswerEvent): boolean {
  const actions = CHANGE_ACTIONS[subject];
  return db.query(`SELECT 1 FROM events WHERE subject = ? AND subject_id = ? AND seq > ? AND action IN (${actions.map(() => '?').join(', ')}) LIMIT 1`).get(subject, answer.id, answer.seq, ...actions) !== null;
}

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
  const query = kdb(db)
    .selectFrom('events')
    .select(['seq', 'subject_id as id', 'actor', 'data', 'at'])
    .where('subject', '=', 'unblock')
    .where('action', '=', 'console-review')
    .where('at', '>=', window.from)
    .where('at', '<', window.to)
    .orderBy('seq')
    .compile();
  const rows = runSyncQuery(db, query, AnswerEventSchema);
  return rows.flatMap((r) => {
    const data = ReviewDataSchema.parse(JSON.parse(r.data));
    const item = getUnblock(db, r.id);
    if (item === null) {
      return [];
    }

    const facts = data.facts ?? (isChangedSince(db, 'unblock', r) ? { title: null, issues: [], session: null, ref: null } : { title: item.title ?? item.task, issues: item.unblocks.map((unblock) => unblock.issue), session: item.added_by, ref: findSubjectLink(item)?.url ?? null });
    return [{ source: 'review', id: item.id, kind: 'review', title: facts.title, issues: facts.issues, session: facts.session, picked: REVIEW_LABELS[data.review], stuPick: null, words: data.note, ref: facts.ref, via: r.actor, at: r.at }];
  });
}

function loadTypedAnswers(db: Database, window: AnswerWindow): Answer[] {
  const query = kdb(db).selectFrom('typed').selectAll().where('at', '>=', window.from).where('at', '<', window.to).orderBy('id').compile();
  const rows = runSyncQuery(db, query, TypedRowSchema);
  return rows.map((t) => ({ source: 'typed', id: String(t.id), kind: t.source_kind, title: null, issues: [], session: t.to_name ?? t.to_session, picked: null, stuPick: null, words: t.text, ref: typedSource(t), via: t.typed_by, at: t.at }));
}
