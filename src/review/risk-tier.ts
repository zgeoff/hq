import { collectChangedLines } from './collect-changed-lines.ts';
import { REVIEW_EFFORT } from './review-effort.ts';
import { RISK_EFFORT } from './risk-effort.ts';
import { RISK_PATHS } from './risk-paths.ts';
import { RISK_WORDS } from './risk-words.ts';
import type { Effort } from './types.ts';

export function riskTier(paths: string[], diff: string): { effort: Effort; reason: string } {
  for (const p of paths) for (const [re, what] of RISK_PATHS) if (re.test(p)) return { effort: RISK_EFFORT, reason: `${what}: path ${p}` };
  for (const l of collectChangedLines(diff)) {
    for (const [re, what] of RISK_WORDS) {
      const m = re.exec(l);
      if (m) return { effort: RISK_EFFORT, reason: `${what}: diff has "${m[0]}"` };
    }
  }
  return { effort: REVIEW_EFFORT, reason: 'no risk match in paths or diff' };
}
