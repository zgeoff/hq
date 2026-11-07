import type { z } from 'zod';
import { defineItemInputSchema } from './define-item-input-schema.ts';
import { HqError } from './errors.ts';
import { parsePRURL } from './parse-pr-url.ts';

export type ItemInput = z.output<ReturnType<typeof defineItemInputSchema>>;
export type ItemOption = NonNullable<ItemInput['options']>[number];
export type ItemGrant = NonNullable<ItemOption['grants']>;
export type ItemDetail = ItemInput['details'][number];

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

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(top)'}: ${i.message}`).join('; ');
}

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
