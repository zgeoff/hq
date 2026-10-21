import type { Database } from 'bun:sqlite';
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
    try {
      const { ref } = normalizePrRef(mark[1]!);
      const owner = db.query('SELECT issue FROM run_prs WHERE ref = ?').get(ref) as { issue: string } | null;
      if (!owner) attachPr(db, issue, ref);
      if ((!owner || owner.issue === issue) && markFinal(db, { ref, sha: String(mark[2]), source: `marker:${source}`, actor, note })) {
        final = ref;
      }
    } catch {}
  } else {
    const phrase = FINAL_PHRASE.exec(text);
    if (phrase) {
      // The PR the phrase speaks of: when the note names PRs, exactly one of them must
      // be this row's open PR; only a note that names none falls back to the only open PR.
      const open = (db.query(`SELECT ref FROM run_prs WHERE issue = ? AND state = 'open'`).all(issue) as { ref: string }[]).map((p) => p.ref);
      // A note that names any PR outside this row is ambiguous: mark nothing.
      const mentioned = mentionedPrs(text);
      const ours = (db.query('SELECT ref FROM run_prs WHERE issue = ?').all(issue) as { ref: string }[]).map((p) => p.ref);
      const foreign = mentioned.some((r) => !ours.includes(r));
      const named = mentioned.filter((r) => open.includes(r));
      const target = foreign ? undefined : mentioned.length ? (named.length === 1 ? named[0] : undefined) : open.length === 1 ? open[0] : undefined;
      if (target && markFinal(db, { ref: target, sha: String(phrase[1]), source: `phrase:${source}`, actor, note })) {
        final = target;
      }
    }
  }
  return { prs: found, final };
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
