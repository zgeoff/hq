import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface StubPrivateDirOptions {
  path: string;
  rows: [string, string][];
  marker: string;
}

export function createStubBriefPrivateDir(root: string, options: StubPrivateDirOptions): void {
  const file = join(root, options.path);
  mkdirSync(dirname(file), { recursive: true });
  const table = ['| Action | Phrase in the brief |', '| ------ | ------------------- |', ...options.rows.map(([action, phrase]) => `| ${action} | ${phrase} |`)];
  const text = ['# briefs', '', '## briefs (the opening)', '', 'Opening text.', '', '## permission phrasing', '', 'List only what is approved.', '', ...table, '', '## the closing', '', options.marker, ''].join('\n');
  writeFileSync(file, text);
}
