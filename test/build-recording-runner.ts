import type { Runner } from '../src/runner/types.ts';

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
