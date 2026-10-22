import { collectChangedLines } from './collect-changed-lines.ts';

// The allow-or-deny pass runs only when the diff adds or changes an allow-or-deny check (INTERIM, as above). When unsure (no diff to read), it runs.
export function allowDenyNeeded(paths: string[] | null, diff: string | null): { run: boolean; reason: string } {
  // No u flag: with i, it folds Unicode case and widens \b, so a Kelvin sign before allow would stop matching.
  // oxlint-disable-next-line require-unicode-regexp
  const GATE_PATHS = /polic(?:y|ies)|permission|grant|rules?\b|acl|allow|deny|guard|gate|auth/i,
    // oxlint-disable-next-line require-unicode-regexp
    GATE_WORDS = /allow-?list|deny-?list|white-?list|black-?list|\bpermission|\bgrants?\b|polic(?:y|ies)|\brules?\b|\bacl\b|rbac|authori[sz]|\ballow(?:ed|s)?\b|\bden(?:y|ied|ies)\b|forbid|\bis[A-Z]\w*Allowed\b|\bcan[A-Z]\w*\(/i;
  if (paths === null || diff === null) return { run: true, reason: 'the diff could not be read' };
  const p = paths.find((x) => GATE_PATHS.test(x));
  if (p) return { run: true, reason: `path ${p}` };
  for (const l of collectChangedLines(diff)) {
    const m = GATE_WORDS.exec(l);
    if (m) return { run: true, reason: `diff has "${m[0]}"` };
  }
  return { run: false, reason: 'no permission, rule, grant, allowlist, denylist or policy change in the diff' };
}
