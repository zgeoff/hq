// Only bun build --define sets HQ_BUILD, so a run from source (bun test, bun src/cli.ts) lacks it
// and the installed binary has it. NODE_ENV cannot tell them apart: the binary reads it at run time.
export function isSourceRun(): boolean {
  return globalThis.HQ_BUILD === undefined;
}
