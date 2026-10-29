import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { PR_IN_TEXT } from './pr-in-text.ts';
import { scheduleFinalReview as markFinal } from './schedule-final-review.ts';
import { registerRunPR as attachPr } from './register-run-pr.ts';

export function applyNoteSignals(db: Database, issue: string, text: string, source: string, note: number | null = null, actor: string = source): { prs: string[]; final: string | null } {
  // The fixed phrase briefs ask for: "FINAL <repo>#<n> <sha>". Also today's
  // wording: "... is final (again) at <sha>" next to a PR reference.
  // The callers read both patterns' groups by index. FINAL_PHRASE has no u: with i, u adds
  // Unicode case folding, so "ſ" would match the s in "is".
  // oxlint-disable-next-line prefer-named-capture-group
  const FINAL_MARK = /^\s*FINAL\s+(\S+#\d+)\s+([0-9a-f]{7,40})\b/u,
    // oxlint-disable-next-line prefer-named-capture-group, require-unicode-regexp
    FINAL_PHRASE = /\bis final(?: again)? at ([0-9a-f]{7,40})\b/i,
    found: string[] = [];
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
    final = applyFinalMark(db, { issue, ref: mark[1] ?? '', sha: mark[2] ?? '', source: `marker:${source}`, actor, note });
  } else {
    const phrase = FINAL_PHRASE.exec(text);
    if (phrase) {
      const target = pickPhraseTarget(mentionedPrs(text), readIssueRefs(db, issue));
      if (target !== null && markFinal(db, { ref: target, sha: String(phrase[1]), source: `phrase:${source}`, actor, note })) {
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
  return markFinal(db, { ref, sha: input.sha, source: input.source, actor: input.actor, note: input.note }) ? ref : null;
}

function parseMarkedRef(raw: string): string | null {
  try {
    return normalizePrRef(raw).ref;
  } catch {
    return null;
  }
}

interface IssueRefs {
  all: ReadonlySet<string>;
  open: ReadonlySet<string>;

  // The open PRs a design pass did not leave behind.
  deliveryOpen: readonly string[];
}

// The PR the phrase speaks of. A note that names any PR outside this row is ambiguous: mark nothing.
// When the note names PRs, exactly one of them must be this row's open PR. Only a note that names
// none falls back to the only open PR, a design pass's PR left out, since a build agent speaks of its own.
function pickPhraseTarget(mentioned: readonly string[], refs: IssueRefs): string | null {
  if (mentioned.some((ref) => !refs.all.has(ref))) {
    return null;
  }
  if (mentioned.length > 0) {
    const named = mentioned.filter((ref) => refs.open.has(ref));
    return named.length === 1 ? (named[0] ?? null) : null;
  }
  return refs.deliveryOpen.length === 1 ? (refs.deliveryOpen[0] ?? null) : null;
}

function mentionedPrs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(PR_IN_TEXT)) {
    try {
      refs.add(normalizePrRef(m[0]).ref);
    } catch {}
  }
  return [...refs];
}

const IssuePRsSchema = z.array(z.object({ ref: z.string(), state: z.string(), design_pass: z.number() }));

function readIssueRefs(db: Database, issue: string): IssueRefs {
  const rows = IssuePRsSchema.parse(db.query('SELECT ref, state, design_pass FROM run_prs WHERE issue = ? ORDER BY added_at').all(issue));
  const open = rows.filter((row) => row.state === 'open');
  return { all: new Set(rows.map((row) => row.ref)), open: new Set(open.map((row) => row.ref)), deliveryOpen: open.filter((row) => row.design_pass === 0).map((row) => row.ref) };
}
