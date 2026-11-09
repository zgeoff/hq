import { COMMANDS } from './commands.ts';
import type { Command } from './commands.ts';

export function findCommand(noun: string, verb: string | undefined, commands: readonly Command[] = COMMANDS): Command | undefined {
  const rows = commands.filter((command) => command.nouns.includes(noun));
  const exact = verb === undefined ? rows.find((command) => command.bare) : rows.find((command) => command.verbs?.includes(verb));
  return exact ?? rows.find((command) => command.verbs === null) ?? rows[0];
}
