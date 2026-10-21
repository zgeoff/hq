// The folder noslop runs from for one commit: a worktree of the base clone, made once by a pin and
// never moved after, so a run always runs the commit it records.
export function buildRunDir(base: string, sha: string): string {
  return `${base}-${sha}`;
}
