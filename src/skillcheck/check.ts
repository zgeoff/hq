import { GLOBAL_FLAGS } from './global-flags.ts';
import type { Form, Problem, Use } from './types.ts';

export function check(forms: Form[], uses: Use[]): Problem[] {
  const problems: Problem[] = [];
  for (const u of uses) {
    const ofTop = forms.filter((f) => f.top === u.top);
    if (!ofTop.length) {
      problems.push({ use: u, why: `hq ${u.top} is not a command in hq --help` });
      continue;
    }
    const verbs = new Set(ofTop.map((f) => f.verb).filter((v): v is string => v !== null));
    // A word after the top is a verb when the top has verbs; with none, it is a positional.
    let match = ofTop.filter((f) => f.verb === u.verb);
    if (u.verb !== null && !verbs.has(u.verb)) {
      if (verbs.size && !ofTop.some((f) => f.verb === null && f.positional)) {
        problems.push({ use: u, why: `hq ${u.top} ${u.verb}: no such command in hq --help (hq ${u.top} takes ${[...verbs].join(', ')})` });
        continue;
      }
      match = ofTop.filter((f) => f.verb === null && (f.positional || !verbs.size));
    }
    if (!match.length) {
      problems.push({ use: u, why: `hq ${u.top}${u.verb ? ` ${u.verb}` : ''} is not a form in hq --help` });
      continue;
    }
    const allowed = new Set([...GLOBAL_FLAGS, ...match.flatMap((f) => [...f.flags])]);
    const bad = u.flags.filter((x) => !allowed.has(x));
    if (bad.length) problems.push({ use: u, why: `hq ${u.top}${u.verb ? ` ${u.verb}` : ''} has no ${bad.join(', ')} in hq --help` });
  }
  return problems;
}
