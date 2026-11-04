import { match } from 'ts-pattern';
import { HqError } from '../errors.ts';
import type { FocusFilter, FocusTerm } from './types.ts';

export function parseFocusTerms(raw: string, areas: readonly string[]): FocusTerm[] {
  const texts = raw.split(',').map((text) => text.trim());
  if (texts.some((text) => text === '')) {
    throw new HqError('bad_args', `focus: an empty term in "${raw}"; split terms with "," and filters with ":"`);
  }
  return texts.map((text) => ({ text, filters: text.split(':').map((filter) => parseFilter(filter.trim(), text, areas)) }));
}

function parseFilter(raw: string, term: string, areas: readonly string[]): FocusFilter {
  const word = raw.toLowerCase();
  const pair = /^(?<key>[a-z]+)=(?<value>.+)$/u.exec(raw);
  if (pair?.groups !== undefined) {
    return parsePair(pair.groups['key'] ?? '', (pair.groups['value'] ?? '').trim(), term, areas);
  }
  const known = findWord(word, areas);
  if (known === null) {
    throw new HqError('bad_args', `focus: unknown filter "${raw}" in term "${term}"; ${formatKnown(areas)}`);
  }
  return known;
}

const KEYS = ['project', 'label'] as const;

function parsePair(key: string, value: string, term: string, areas: readonly string[]): FocusFilter {
  const known = KEYS.find((name) => name === key);
  if (known === undefined || value === '') {
    throw new HqError('bad_args', `focus: unknown filter "${key}=${value}" in term "${term}"; ${formatKnown(areas)}`);
  }
  return match(known)
    .with('project', (): FocusFilter => ({ kind: 'project', value }))
    .with('label', (): FocusFilter => ({ kind: 'label', value }))
    .exhaustive();
}

const CLASSES = ['maintenance', 'roadmap'] as const;
const TYPES = ['bug', 'feature', 'chore', 'improvement', 'investigation'] as const;
const PRIORITIES = ['urgent', 'high+', 'medium+'] as const;

function formatKnown(areas: readonly string[]): string {
  return `filters are ${[...CLASSES, ...TYPES, ...PRIORITIES].join('|')}, an area (${areas.join('|')}), project=<name> and label=<name>; a new area needs its label in Linear, then hq linear areas --team GEO`;
}

function findWord(word: string, areas: readonly string[]): FocusFilter | null {
  const focusClass = CLASSES.find((name) => name === word);
  const type = TYPES.find((name) => name === word);
  const priority = PRIORITIES.find((name) => name === word);
  const area = areas.find((name) => name === word);
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
