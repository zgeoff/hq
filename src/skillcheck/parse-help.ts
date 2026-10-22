import type { Form } from './types.ts';

const flagsIn = (s: string) => new Set(s.match(/--[a-z][a-z0-9-]*/g) ?? []);

const WORD = /^[a-z][a-z-]*$/;

const alts = (tok: string) => tok.split('|').filter((x) => WORD.test(x));

// The help text as forms. A usage is a line's text before its first run of 2+ spaces; a
// continuation line that starts with [ or ( adds its flags to the forms just above it.
export function parseHelp(help: string): Form[] {
  const forms: Form[] = [];
  let last: Form[] = [];
  let top: string[] = [];
  for (const raw of help.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith('hq ')) {
      if (/^[[(]/.test(line) && raw.startsWith(' ')) for (const f of last) for (const x of flagsIn(line.split(/\s{2,}/)[0]!)) f.flags.add(x);
      continue;
    }
    const usage = line.split(/\s{2,}/)[0]!;
    last = [];
    for (const seg of topLevel(usage)) {
      const toks = seg.split(/\s+/);
      let rest: string[];
      if (toks[0] === 'hq') {
        top = alts(toks[1] ?? '');
        rest = toks.slice(2);
      } else rest = toks; // "… | show <issue>": the verb of the same top
      if (!top.length) continue;
      const head = rest[0] ?? '';
      let verbs: (string | null)[];
      const optionalVerb = /^\[[a-z|-]+\]$/u.test(head);
      if (alts(head).length && !head.startsWith('[')) verbs = alts(head);
      else if (optionalVerb) {
        verbs = [null, ...alts(head.slice(1, -1))];
      } else {
        verbs = [null];
      }
      // A positional: <x>, or [x] that is not a flag or a verb list.
      const args = optionalVerb ? rest.slice(1) : rest;
      const positional = args.some((token) => /^<[^>]+>$/u.test(token) || /^\[[a-z][a-z ]*\]$/u.test(token));
      for (const t of top) for (const v of verbs) {
        const f: Form = { top: t, verb: v, flags: flagsIn(seg), positional };
        forms.push(f);
        last.push(f);
      }
    }
  }
  return forms;
}

// Split on " | " outside brackets and parentheses.
function topLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '[' || c === '(' || c === '<') depth++;
    else if (c === ']' || c === ')' || c === '>') depth = Math.max(0, depth - 1);
    if (depth === 0 && s.startsWith(' | ', i)) {
      out.push(cur);
      cur = '';
      i += 2;
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
