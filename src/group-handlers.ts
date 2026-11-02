import type { Ctx, Out } from './commands.ts';

export const GROUP_HANDLERS = new Map<string, (context: Ctx) => Promise<Out>>();
