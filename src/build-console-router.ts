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

export interface ConsoleContext {
  db: Database;
  actor: string;

  // Runs gh, to read a reviewed PR's head.
  run: Runner;

  // Sends what the write queued, and says whether the owner session got it.
  notify: () => Promise<boolean>;

  // The Shipped tab's report for a period, read from GitHub and Linear.
  loadShipped: (period: ShippedPeriod) => Promise<ShippedReport>;
}

// The console's typed API: the page reads the items and writes answers through hq's own functions.
export function buildConsoleRouter() {
  const base = os.$context<ConsoleContext>();
  return {
    items: {
      list: base.handler((args) => loadConsoleItems(args.context.db)),
      answer: base.input(z.object({ id: z.string(), option: z.string(), note: z.string() })).handler(async (args) => {
        const ask = recordConsoleAnswer(args.context.db, { ...args.input, actor: args.context.actor }),
          told = await args.context.notify();
        return { id: ask.id, answer: ask.answer, told };
      }),
    },
    unblock: {
      mark: base.input(z.object({ id: z.string(), mark: z.enum(['done', 'later', 'skip']), note: z.string() })).handler(async (args) => {
        const item = recordConsoleMark(args.context.db, { ...args.input, actor: args.context.actor }),
          told = await args.context.notify();
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

// The review is stored. Its PR's record is written next, then the owner session is told, whatever
// the record write did.
async function recordReviewAndNotify(context: ConsoleContext, item: UnblockItem, input: ConsolePRAnswerInput): Promise<{ id: string; state: string; told: boolean }> {
  await recordConsolePRAnswer(context.db, context.run, item, input).catch(() => false);
  const told = await context.notify();
  return { id: item.id, state: item.state, told };
}

// A failed read says why on the page; the reasons are local and hold no secret.
async function readShipped(context: ConsoleContext, period: ShippedPeriod): Promise<ShippedReport> {
  try {
    return await context.loadShipped(period);
  } catch (error) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: (error as Error).message });
  }
}

export type ConsoleRouter = ReturnType<typeof buildConsoleRouter>;
