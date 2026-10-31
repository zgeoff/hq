import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The agent kit's briefs and playbooks carry hq lines too, so they are checked with the skills.
const DIRECTORIES = ['skills', 'agent-kit'];

export function skillFiles(root: string): string[] {
  return DIRECTORIES.filter((directory) => existsSync(join(root, directory))).flatMap((directory) =>
    readdirSync(join(root, directory), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith('.md'))
      .toSorted()
      .map((file) => join(directory, file)),
  );
}
