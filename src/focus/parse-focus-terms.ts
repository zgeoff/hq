import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import { FOCUS_AREAS } from './focus-areas.ts';
import type { FocusFilter, FocusTerm } from './types.ts';

// `bug,maintenance:nixie`: terms split by `,` in priority order, filters in a term joined by `:`.
// Any term or filter it does not know refuses the whole list.
export function parseFocusTerms(raw: string): FocusTerm[] {
  const texts = raw.split(',').map((text) => text.trim());
  if (texts.some((text) => text === '')) {
    throw new HqError('bad_args', `focus: an empty term in "${raw}"; split terms with "," and filters with ":"`);
  }
  return texts.map((text) => ({ text, filters: text.split(':').map((filter) => parseFilter(filter.trim(), text)) }));
}

function parseFilter(raw: string, term: string): FocusFilter {
  const word = raw.toLowerCase();
  const pair = /^(?<key>[a-z]+)=(?<value>.+)$/u.exec(raw);
  if (pair?.groups !== undefined) {
    return parsePair(pair.groups['key'] ?? '', (pair.groups['value'] ?? '').trim(), term);
  }
  const known = findWord(word);
  if (known === null) {
    throw new HqError('bad_args', `focus: unknown filter "${raw}" in term "${term}"; ${formatKnown()}`);
  }
  return known;
}

const KEYS = ['project', 'label'] as const;

function parsePair(key: string, value: string, term: string): FocusFilter {
  const known = KEYS.find((name) => name === key);
  if (known === undefined || value === '') {
    throw new HqError('bad_args', `focus: unknown filter "${key}=${value}" in term "${term}"; ${formatKnown()}`);
  }
  return match(known)
    .with('project', (): FocusFilter => ({ kind: 'project', value }))
    .with('label', (): FocusFilter => ({ kind: 'label', value }))
    .exhaustive();
}

const CLASSES = ['maintenance', 'roadmap'] as const;
const TYPES = ['bug', 'feature', 'chore', 'improvement', 'investigation'] as const;
const PRIORITIES = ['urgent', 'high+', 'medium+'] as const;

function formatKnown(): string {
  return `filters are ${[...CLASSES, ...TYPES, ...PRIORITIES].join('|')}, an area (${FOCUS_AREAS.join('|')}), project=<name> and label=<name>`;
}

function findWord(word: string): FocusFilter | null {
  const focusClass = CLASSES.find((name) => name === word);
  const type = TYPES.find((name) => name === word);
  const priority = PRIORITIES.find((name) => name === word);
  const area = FOCUS_AREAS.find((name) => name === word);
  if (focusClass !== undefined) {
    return { kind: 'class', value: focusClass };
  }
  if (type !== undefined) {
    return { kind: 'type', value: type };
  }
  if (priority !== undefined) {
    return { kind: 'priority', value: priority };
  }
  if (area !== undefined) {
    return { kind: 'area', value: area };
  }
  return null;
}
