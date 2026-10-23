import { COMMANDS } from './commands.ts';
import type { Command } from './commands.ts';

// The row for `hq <noun> [verb]`: the row that lists the verb; else, with no verb, the noun's bare
// row; else the noun's catch-all (verbs null); else the noun's first row. That last step keeps a
// verb no row lists inside its group, whose function reports the error it always did. Every row
// of a group shares the group's function, so which row answers does not change what runs.
export function lookup(noun: string, verb: string | undefined, commands: readonly Command[] = COMMANDS): Command | undefined {
  const rows = commands.filter((command) => command.nouns.includes(noun));
  const exact = verb === undefined ? rows.find((command) => command.bare) : rows.find((command) => command.verbs?.includes(verb));
  return exact ?? rows.find((command) => command.verbs === null) ?? rows[0];
}
