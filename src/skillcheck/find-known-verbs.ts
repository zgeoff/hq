import type { Command } from '../commands.ts';

export function findKnownVerbs(commands: readonly Pick<Command, 'nouns' | 'verbs'>[], top: string): readonly string[] | null | undefined {
  const specs = commands.filter((command) => command.nouns.includes(top));
  if (specs.length === 0) {
    return undefined;
  }
  return specs.some((command) => command.verbs === null) ? null : specs.flatMap((command) => command.verbs ?? []);
}
