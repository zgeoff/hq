import type { Ctx, Out } from './commands.ts';
import { GROUP_HANDLERS } from './group-handlers.ts';

// cli.ts holds the group functions and imports the command registry at load, so the registry cannot
// import them back: cli.ts hands them over here before it runs a command. A dynamic import of cli.ts
// would leave a handler waiting on the entry module, which waits on it.
export function registerGroups(groups: Record<string, (context: Ctx) => Promise<Out>>): void {
  GROUP_HANDLERS.clear();
  for (const [name, handler] of Object.entries(groups)) {
    GROUP_HANDLERS.set(name, handler);
  }
}
