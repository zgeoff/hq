// NODE_ENV cannot tell a run from source and the installed binary apart: the binary reads it at run
// time.
export function isSourceRun(): boolean {
  return globalThis.HQ_BUILD === undefined;
}
