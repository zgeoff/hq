import type { PidFind } from './types.ts';

// The claude process of a session: atc starts it with `--add-dir <state>/atc/sessions/<id>/...`.
// Only an argument that follows --add-dir counts, so a shell or an editor that merely mentions
// the path does not. Exactly one process must match.
export function pidFromCmdlines(sessionId: string, procs: { pid: number; args: string[] }[]): PidFind {
  const dir = `/atc/sessions/${sessionId}`;
  const isDir = (a: string) => a.endsWith(dir) || a.includes(`${dir}/`);
  const hits = procs.filter(({ args }) => args.some((a, i) => (a === '--add-dir' && isDir(args[i + 1] ?? '')) || (a.startsWith('--add-dir=') && isDir(a.slice(10)))));
  if (hits.length === 1) return { pid: hits[0]!.pid };
  return { why: hits.length ? `${hits.length} processes carry the session's directory` : "no process carries the session's directory" };
}
