import type { Database } from 'bun:sqlite';
import { ORPCError, os } from '@orpc/server';
import { z } from 'zod';
import { loadConsoleItems } from './load-console-items.ts';
import { recordConsoleAnswer } from './record-console-answer.ts';
import { recordConsoleMark } from './record-console-mark.ts';
import type { UnblockItem } from './unblock/types.ts';
import type { ConsolePRAnswerInput } from './record-console-pr-answer.ts';
import { recordConsolePRAnswer } from './record-console-pr-answer.ts';
import { recordConsoleReview } from './record-console-review.ts';
import type { Runner } from './runner/types.ts';
import type { ShippedPeriod, ShippedReport } from './shipped/types.ts';
import { toErrorMessage } from './to-error-message.ts';

export interface ConsoleContext {
  db: Database;
  actor: string;

  run: Runner;

  notify: () => Promise<boolean>;

  loadShipped: (period: ShippedPeriod) => Promise<ShippedReport>;
}

export function buildConsoleRouter() {
  const base = os.$context<ConsoleContext>();
  return {
    items: {
      list: base.handler((args) => loadConsoleItems(args.context.db)),
      answer: base.input(z.object({ id: z.string(), option: z.string(), note: z.string() })).handler(async (args) => {
        const ask = recordConsoleAnswer(args.context.db, { ...args.input, actor: args.context.actor });
        const told = await args.context.notify();
        return { id: ask.id, answer: ask.answer, told };
      }),
    },
    unblock: {
      mark: base.input(z.object({ id: z.string(), mark: z.enum(['done', 'later', 'skip']), note: z.string() })).handler(async (args) => {
        const item = recordConsoleMark(args.context.db, { ...args.input, actor: args.context.actor });
        const told = await args.context.notify();
        return { id: item.id, state: item.state, told };
      }),
      review: base.input(z.object({ id: z.string(), review: z.enum(['lgtm', 'changes', 'later', 'reject']), note: z.string() })).handler(async (args) => {
        const item = recordConsoleReview(args.context.db, { ...args.input, actor: args.context.actor });
        return await recordReviewAndNotify(args.context, item, { ...args.input, actor: args.context.actor });
      }),
    },
    shipped: {
      report: base.input(z.object({ period: z.enum(['today', 'yesterday', 'week']) })).handler(async (args) => await readShipped(args.context, args.input.period)),
    },
  };
}

async function recordReviewAndNotify(context: ConsoleContext, item: UnblockItem, input: ConsolePRAnswerInput): Promise<{ id: string; state: string; told: boolean }> {
  await recordConsolePRAnswer(context.db, context.run, item, input).catch(() => false);
  const told = await context.notify();
  return { id: item.id, state: item.state, told };
}

// The reasons a failed read gives are local and hold no secret.
async function readShipped(context: ConsoleContext, period: ShippedPeriod): Promise<ShippedReport> {
  try {
    return await context.loadShipped(period);
  } catch (error) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: toErrorMessage(error) });
  }
}

export type ConsoleRouter = ReturnType<typeof buildConsoleRouter>;
