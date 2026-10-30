import type { Runner } from '../src/runner/types.ts';

// Wraps a runner and keeps each command it ran, in order, so a test can assert what was asked.
export function buildRecordingRunner(inner: Runner): { run: Runner; commands: string[][] } {
  const commands: string[][] = [];
  return {
    run: (command, opts) => {
      commands.push([...command]);
      return inner(command, opts);
    },
    commands,
  };
}
