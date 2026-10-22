// The structured fields of a call, proposal or unblock item, as the console shows them (console
// brief, `Item`). `hq call|proposal|unblock add --item` takes them, validated here; every text is kept
// verbatim. An item filed as free text has none and shows its body instead.
import { z } from 'zod';
import { HqError } from './errors.ts';
import { parsePRURL } from './parse-pr-url.ts';

export type ItemInput = z.output<ReturnType<typeof defineItemInputSchema>>;
export type ItemOption = NonNullable<ItemInput['options']>[number];
export type ItemGrant = NonNullable<ItemOption['grants']>;
export type ItemDetail = ItemInput['details'][number];

// The part stored in the row's `item` column: everything but the title, question and Stu's view,
// which have columns of their own.
export type ItemExtras = Omit<ItemInput, 'title' | 'question' | 'stuView'>;

export type ItemKind = 'call' | 'proposal' | 'unblock';

export function parseItemInput(kind: ItemKind, raw: string): ItemInput {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HqError('bad_args', '--item is not JSON');
  }
  const parsed = defineItemInputSchema().safeParse(json);
  if (!parsed.success) {
    throw new HqError('bad_args', `--item does not fit the item shape: ${formatIssues(parsed.error)}`);
  }
  checkKind(kind, parsed.data);
  return parsed.data;
}

const TITLE_MAX = 80;

// What `--item` carries. Title and question also fill the row's own columns.
function defineItemInputSchema() {
  const DetailSchema = z.strictObject({ heading: defineText(), text: defineText(), code: defineText().optional() }),
    DiffSchema = z.strictObject({ now: defineText(), would: defineText() }),
    LinkSchema = z.strictObject({ label: defineText(), url: z.url({ protocol: /^https?$/u }), subject: z.literal(true).optional() }),
    GrantSchema = z.strictObject({ action: z.enum(['override', 'accept-risk']), pr: z.string().regex(/^[\w.-]+\/[\w.-]+#\d+$/u, 'must be <owner>/<repo>#<number>'), finding: defineText().optional(), head: z.string().regex(/^[0-9a-f]{40}$/u, 'must be a 40-character commit sha').optional() }),
    OptionSchema = z.strictObject({ label: defineText(), effect: defineText(), recommended: z.boolean().optional(), grants: GrantSchema.optional() }),
    UnblocksSchema = z.strictObject({ id: defineText(), title: defineText() });
  return z.strictObject({
    title: defineText().max(TITLE_MAX),
    question: defineText(),
    deadline: defineText().optional(),
    time: defineText().optional(),
    options: z.array(OptionSchema).min(2).max(4).optional(),
    stuView: defineText().optional(),
    details: z.array(DetailSchema).default([]),
    diff: DiffSchema.optional(),
    unblocks: z.array(UnblocksSchema).default([]),
    links: z.array(LinkSchema).default([]),
  });
}

// Text is stored as given, spaces and all; it only has to hold something.
function defineText() {
  return z.string().regex(/\S/u, 'must not be blank');
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ');
}

// A call needs 2 to 4 options and a proposal its diff too; an unblock item has the fixed Done, Later
// and Skip, so it takes none.
function checkKind(kind: ItemKind, item: ItemInput): void {
  if (kind === 'unblock' && item.options !== undefined) {
    throw new HqError('bad_args', '--item: an unblock item takes no options; it has Done, Later and Skip');
  }
  if (kind !== 'unblock' && item.options === undefined) {
    throw new HqError('bad_args', `--item: a ${kind} needs 2 to 4 options`);
  }
  if (kind === 'proposal' && item.diff === undefined) {
    throw new HqError('bad_args', '--item: a proposal needs its diff ({now, would})');
  }
  checkGrants(kind, item);
  checkSubject(kind, item);
}

// Only a call's option grants an action, and an accepted risk names its finding while an override
// names none.
function checkGrants(kind: ItemKind, item: ItemInput): void {
  for (const option of item.options ?? []) {
    if (option.grants === undefined) {
      continue;
    }
    if (kind !== 'call') {
      throw new HqError('bad_args', `--item: a ${kind} option grants nothing; only a call's option does`);
    }
    if ((option.grants.action === 'accept-risk') !== (option.grants.finding !== undefined)) {
      throw new HqError('bad_args', `--item: option "${option.label}": an accept-risk grant names its finding, and an override grant names none`);
    }
  }
}

// A subject link marks the PR an unblock item is about (a review, lgtm or merge ask): the watcher
// drops the item once that PR merges or closes. A link given only as context carries no mark.
function checkSubject(kind: ItemKind, item: ItemInput): void {
  const subjects = item.links.filter((l) => l.subject === true);
  if (subjects.length > 0 && kind !== 'unblock') {
    throw new HqError('bad_args', `--item: a ${kind} takes no subject link; only an unblock item does`);
  }
  if (subjects.length > 1) {
    throw new HqError('bad_args', '--item: an item takes one subject link at most');
  }
  if (subjects[0] && !parsePRURL(subjects[0].url)) {
    throw new HqError('bad_args', '--item: a subject link must be a GitHub pull request URL, such as https://github.com/owner/repo/pull/12');
  }
}
