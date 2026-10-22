import { readFileSync } from 'node:fs';
import { HqError } from '../errors.ts';

const NAME_SHAPE = /^[ \t]*'(?<name>\d{4}-[a-z0-9-]+)':/gmu;

// The migration names a noslop clone applies: the quoted keys of the object in its load-store.ts.
export function readCloneMigrations(clone: string): string[] {
  const file = `${clone}/adapters/sqlite/src/load-store.ts`,
    names = [...readText(file).matchAll(NAME_SHAPE)].map((match) => match.groups?.['name'] ?? '');
  if (names.length === 0) {
    throw new HqError('store_unreadable', `hq cannot read the store migrations the new noslop applies: ${file} names none`);
  }
  return names;
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw new HqError('store_unreadable', `hq cannot read the store migrations the new noslop applies: ${file}: ${(error as Error).message}`);
  }
}
