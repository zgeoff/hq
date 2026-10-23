// `hq call|proposal|unblock add --item <file|->`, `hq call|proposal stu` and `hq unblock later`: the
// console's structured items from the command line. The other verbs stay in cli.ts.
import type { Database } from 'bun:sqlite';
import type { Ask } from './asks/types.ts';
import type { Out } from './commands.ts';
import { HqError } from './errors.ts';
import { applyAskItem } from './apply-ask-item.ts';
import { applyUnblockItem } from './apply-unblock-item.ts';
import { parseItemInput } from './parse-item-input.ts';
import type { ItemInput, ItemKind } from './parse-item-input.ts';
import { renderItemBody } from './render-item-body.ts';
import { setStuView } from './set-stu-view.ts';
import { setUnblockLater } from './set-unblock-later.ts';
import { parseDoneWhen } from './unblock/parse-done-when.ts';
import { parseUnblocks } from './unblock/parse-unblocks.ts';
import { parseWatchFlags } from './unblock/parse-watch-flags.ts';
import type { DoneWhen } from './unblock/types.ts';

type ItemFlags = Record<string, string | string[] | boolean | undefined>;

export interface ItemCommandInput {
  actor: string;
  db: Database;
  flags: ItemFlags;
  id: string | undefined;
  noun: ItemKind;
  verb: 'add' | 'later' | 'stu';
}

export async function runItemCommand(input: ItemCommandInput): Promise<Out> {
  if (input.noun === 'unblock' && input.verb === 'add') {
    return await runUnblockItemAdd(input);
  }
  if (input.noun === 'unblock' && input.verb === 'later') {
    return runUnblockLater(input);
  }
  if (input.noun !== 'unblock' && input.verb === 'add') {
    return await runAskItemAdd(input, input.noun);
  }
  if (input.noun !== 'unblock' && input.verb === 'stu') {
    return runStuView(input, input.noun);
  }
  throw new HqError('bad_args', `hq ${input.noun} ${input.verb} is not an item command`);
}

async function runUnblockItemAdd(input: ItemCommandInput): Promise<Out> {
  checkTextFlags(input.flags);
  const item = await readItemInput('unblock', input.flags),
    rank = input.flags['rank'] === undefined ? undefined : readNumber(input.flags, 'rank'),
    result = applyUnblockItem(
      input.db,
      {
        id: readFlag(input.flags, 'id') ?? null,
        minutes: readNumber(input.flags, 'minutes'),
        unblocks: parseUnblocks(readFlag(input.flags, 'unblocks') ?? ''),
        notify: readList(input.flags, 'notify'),
        doneWhen: readDoneWhen(input.flags),
        ...parseWatchFlags(readFlag(input.flags, 'kind'), readFlag(input.flags, 'deadline')),
        ...(rank === undefined ? {} : { rank }),
        actor: input.actor,
      },
      item,
    );
  return { data: { result: result.result, item: result.item, warnings: result.warnings }, text: `unblock ${result.item.id}: ${result.result}` };
}

function runUnblockLater(input: ItemCommandInput): Out {
  if (input.id === undefined) {
    throw new HqError('bad_args', 'hq unblock later <id> [--until ISO|+4h]');
  }
  const u = setUnblockLater(input.db, input.id, readFlag(input.flags, 'until') ?? null, input.actor);
  return { data: { item: u }, text: `unblock ${u.id}: out of the console until ${u.due_at}.` };
}

async function runAskItemAdd(input: ItemCommandInput, kind: 'call' | 'proposal'): Promise<Out> {
  checkTextFlags(input.flags);
  const item = await readItemInput(kind, input.flags),
    order = input.flags['order'] === undefined ? undefined : readNumber(input.flags, 'order'),
    r = applyAskItem(
      input.db,
      { kind, id: input.id ?? '', issues: readList(input.flags, 'issues'), forSession: readFlag(input.flags, 'for') ?? null, ...(order === undefined ? {} : { order }), actor: input.actor },
      item,
      renderItemBody(item),
    );
  return { data: { result: r.result, note: r.note ?? null, [kind]: r.ask }, text: `${kind} ${r.ask.id}: ${r.result}${r.note === undefined ? '' : ` (${r.note})`}` };
}

function runStuView(input: ItemCommandInput, kind: 'call' | 'proposal'): Out {
  const view = readFlag(input.flags, 'view');
  if (input.id === undefined || view === undefined) {
    throw new HqError('bad_args', `hq ${kind} stu <id> --view "<text>"`);
  }
  return formatStuViewSaved(kind, setStuView(input.db, { id: input.id, kind, view, actor: input.actor }));
}

function formatStuViewSaved(kind: 'call' | 'proposal', a: Ask): Out {
  return { data: { [kind]: a }, text: `${kind} ${a.id}: Stu's view saved.` };
}

function checkTextFlags(flags: ItemFlags): void {
  const given = ['title', 'question', 'body', 'body-file', 'task'].filter((name) => flags[name] !== undefined);
  if (given.length > 0) {
    throw new HqError('bad_args', `--item carries the text: drop ${given.map((name) => `--${name}`).join(', ')}`);
  }
}

async function readItemInput(kind: ItemKind, flags: ItemFlags): Promise<ItemInput> {
  const source = await readSource(readFlag(flags, 'item') ?? '-');
  return parseItemInput(kind, source);
}

async function readSource(source: string): Promise<string> {
  if (source === '-') {
    return await Bun.stdin.text();
  }
  const file = Bun.file(source);
  if (!(await file.exists())) {
    throw new HqError('bad_args', `--item: no file ${source}`);
  }
  return await file.text();
}

function readNumber(flags: ItemFlags, name: string): number | null {
  const raw = readFlag(flags, name);
  if (raw === undefined || raw === 'none') {
    return null;
  }
  if (!/^\d+$/u.test(raw)) {
    throw new HqError('bad_args', `--${name} must be a whole number`);
  }
  return Number(raw);
}

function readList(flags: ItemFlags, name: string): string[] {
  return (readFlag(flags, name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readDoneWhen(flags: ItemFlags): DoneWhen[] {
  const value = flags['done-when'];
  return Array.isArray(value) ? value.map((raw) => parseDoneWhen(raw)) : [];
}

function readFlag(flags: ItemFlags, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}
