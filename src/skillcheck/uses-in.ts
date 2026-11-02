import type { Use } from './types.ts';

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
      const bare = text.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/<[^>]*>/g, '<>');
      const toks = bare.split(/\s+/);
      const LIKE = /^[A-Za-z][\w-]*$/;
      const top = toks[1] ?? '';
      if (!LIKE.test(top)) continue;
      const verb = toks[2] && LIKE.test(toks[2]) ? toks[2] : null;
      out.push({ file, line: i + 1, text, top, verb, flags: [...new Set(bare.match(/--[A-Za-z0-9_][\w-]*/g) ?? [])] });
    }
  });
  return out;
}
