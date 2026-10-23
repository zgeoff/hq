import type { Ctx, Out } from './commands.ts';

// The command groups' handlers, by group name. cli.ts fills it with registerGroups; the command
// registry reads it when a command runs.
export const GROUP_HANDLERS = new Map<string, (context: Ctx) => Promise<Out>>();
