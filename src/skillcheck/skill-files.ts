import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function skillFiles(root: string): string[] {
  return readdirSync(join(root, 'skills'), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join('skills', f));
}
