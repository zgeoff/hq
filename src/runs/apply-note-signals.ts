import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { buildFinalKey } from './build-final-key.ts';
import { collectMentionedPRs } from './collect-mentioned-prs.ts';
import { FINAL_MARK } from './final-mark.ts';
import { FINAL_PHRASE } from './final-phrase.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { parseMarkedRef } from './parse-marked-ref.ts';
import { PR_IN_TEXT } from './pr-in-text.ts';
import { scheduleFinalReview as markFinal } from './schedule-final-review.ts';
import { sendFinalRefusal } from './send-final-refusal.ts';
import { registerRunPR as attachPr } from './register-run-pr.ts';
import type { FinalResolutions } from './types.ts';

interface SignalOptions {
  source: string;
  note?: number | null;
  actor?: string;

  // What GitHub said of each FINAL sha the note gives; a sha it lacks is recorded as given.
  resolutions?: FinalResolutions;
}

const NO_RESOLUTIONS: FinalResolutions = new Map();

export function applyNoteSignals(db: Database, issue: string, text: string, options: SignalOptions): { prs: string[]; final: string | null } {
  const source = options.source;
  const actor = options.actor ?? source;
  const note = options.note ?? null;
  const resolutions = options.resolutions ?? NO_RESOLUTIONS;
  const found: string[] = [];
  for (const m of text.matchAll(PR_IN_TEXT)) {
    // Only a PR the agent says it opened: a note that merely mentions another
    // PR ("rebased after nixie#149 merged") must not attach it.
    const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    if (!/\bopen(?:ed|s)?\b/i.test(before)) continue;
    let parsed: { ref: string; url: string | null };
    try {
      parsed = normalizePrRef(m[0]);
    } catch {
      continue;
    }
    // "#254" with no repo is too loose; only refs with a repo, or URLs.
    const owner = db.query('SELECT issue FROM run_prs WHERE ref = ?').get(parsed.ref) as { issue: string } | null;
    if (owner && owner.issue !== issue) continue;
    attachPr(db, issue, m[0]);
    if (!found.includes(parsed.ref)) found.push(parsed.ref);
  }
  let final: string | null = null;
  const mark = FINAL_MARK.exec(text);
  if (mark) {
    final = applyFinalMark(db, { issue, ref: mark[1] ?? '', sha: mark[2] ?? '', source: `marker:${source}`, actor, note, resolutions });
  } else {
    const phrase = FINAL_PHRASE.exec(text);
    if (phrase) {
      // The PR the phrase speaks of: when the note names PRs, exactly one of them must
      // be this row's open PR; only a note that names none falls back to the only open PR.
      const open = (db.query(`SELECT ref FROM run_prs WHERE issue = ? AND state = 'open'`).all(issue) as { ref: string }[]).map((p) => p.ref);
      // A note that names any PR outside this row is ambiguous: mark nothing.
      const mentioned = collectMentionedPRs(text);
      const ours = (db.query('SELECT ref FROM run_prs WHERE issue = ?').all(issue) as { ref: string }[]).map((p) => p.ref);
      const foreign = mentioned.some((r) => !ours.includes(r));
      const named = mentioned.filter((r) => open.includes(r));
      const target = foreign ? undefined : mentioned.length ? (named.length === 1 ? named[0] : undefined) : open.length === 1 ? open[0] : undefined;
      if (target && markResolved(db, { issue, ref: target, sha: String(phrase[1]), source: `phrase:${source}`, actor, note, resolutions })) {
        final = target;
      }
    }
  }
  return { prs: found, final };
}

interface FinalMarkInput {
  issue: string;
  ref: string;
  sha: string;
  source: string;
  actor: string;
  note: number | null;
  resolutions: FinalResolutions;
}

const RunPrOwnerSchema = z.object({ issue: z.string() }).nullable();

// Only a marker whose ref does not parse is passed over; a failed write aborts the note.
function applyFinalMark(db: Database, input: FinalMarkInput): string | null {
  const ref = parseMarkedRef(input.ref);
  if (ref === null) {
    return null;
  }
  const owner = RunPrOwnerSchema.parse(db.query('SELECT issue FROM run_prs WHERE ref = ?').get(ref));
  if (owner === null) {
    attachPr(db, input.issue, ref);
  } else if (owner.issue !== input.issue) {
    return null;
  }
  return markResolved(db, { ...input, ref }) ? ref : null;
}

// A refused sha leaves a notice for the orchestrator and no mark.
function markResolved(db: Database, input: FinalMarkInput): boolean {
  const resolution = input.resolutions.get(buildFinalKey(input.ref, input.sha)) ?? null;
  if (resolution?.kind === 'refused') {
    sendFinalRefusal(db, { issue: input.issue, ref: input.ref, given: input.sha, refusal: resolution, actor: input.actor });
    return false;
  }
  return markFinal(db, { ref: input.ref, sha: input.sha, source: input.source, actor: input.actor, note: input.note, resolution });
}

