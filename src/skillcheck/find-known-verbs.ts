import type { Command } from '../commands.ts';

// The verbs the dispatcher accepts after a top: a list, null when it takes any word (a positional),
// or undefined when no command has that top.
export function findKnownVerbs(commands: readonly Pick<Command, 'nouns' | 'verbs'>[], top: string): readonly string[] | null | undefined {
  const specs = commands.filter((command) => command.nouns.includes(top));
  if (specs.length === 0) {
    return undefined;
  }
  return specs.some((command) => command.verbs === null) ? null : specs.flatMap((command) => command.verbs ?? []);
}
