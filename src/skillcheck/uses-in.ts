import type { Use } from './types.ts';

// `hq …` in inline code, and code-block lines that start with hq.
export function usesIn(file: string, body: string): Use[] {
  const out: Use[] = [];
  let fence = false;
  body.split('\n').forEach((l, i) => {
    if (/^\s*```/.test(l)) {
      fence = !fence;
      return;
    }
    const cmds = [...l.matchAll(/`(hq [^`]+)`/g)].map((m) => m[1]!);
    if (fence && /^\s*(\$ )?hq [a-z]/.test(l)) cmds.push(l.trim().replace(/^\$ /, ''));
    for (const text of cmds) {
      // Placeholders and quoted values are not command words or flags.
      const bare = text.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/<[^>]*>/g, '<>');
      const toks = bare.split(/\s+/);
      // A word-like token is checked, case and all; `hq <issue>` or `hq …` is not a command.
      const LIKE = /^[A-Za-z][\w-]*$/;
      const top = toks[1] ?? '';
      if (!LIKE.test(top)) continue;
      const verb = toks[2] && LIKE.test(toks[2]) ? toks[2] : null;
      // Any --word a skill writes, case and all: a misspelt flag must fail, not slip past.
      out.push({ file, line: i + 1, text, top, verb, flags: [...new Set(bare.match(/--[A-Za-z0-9_][\w-]*/g) ?? [])] });
    }
  });
  return out;
}
