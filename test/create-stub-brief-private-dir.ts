import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface StubPrivateDirOptions {
  path: string;
  rows: [string, string][];
  marker: string;
}

// A stand-in for the hq-private checkout: briefs.private.md at the given path under the root, with
// an invented opening, the permission phrasing table for the given rows, and a closing section that
// holds the marker text, so a test can prove nothing outside the table is read out.
export function createStubBriefPrivateDir(root: string, options: StubPrivateDirOptions): void {
  const file = join(root, options.path);
  mkdirSync(dirname(file), { recursive: true });
  const table = ['| Action | Phrase in the brief |', '| ------ | ------------------- |', ...options.rows.map(([action, phrase]) => `| ${action} | ${phrase} |`)];
  const text = ['# briefs', '', '## briefs (the opening)', '', 'Opening text.', '', '## permission phrasing', '', 'List only what is approved.', '', ...table, '', '## the closing', '', options.marker, ''].join('\n');
  writeFileSync(file, text);
}
