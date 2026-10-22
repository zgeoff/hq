import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The reference files a skill owns, as `<skill>/references/<file>`, sorted. No folder: none.
export function readSkillReferences(definitionsDirectory: string, skill: string): string[] {
  const folder = join(definitionsDirectory, 'skills', skill, 'references');
  let names: string[];
  try {
    names = readdirSync(folder, { recursive: true, encoding: 'utf8' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => statSync(join(folder, name)).isFile())
    .map((name) => `${skill}/references/${name}`)
    .toSorted();
}
