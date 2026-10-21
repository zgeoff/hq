import type { Out } from '../commands.ts';
import type { Build } from './read-build.ts';

export function renderVersion(version: string, schema: number, build: Build): Out {
  const from = build.commit === null ? '' : `, built from ${build.commit.slice(0, 7)}${build.dirty === true ? ' with uncommitted changes' : ''}`;
  return { data: { version, schema, commit: build.commit, dirty: build.dirty }, text: `hq ${version} (schema v${schema}${from}). The gadget lab is open.` };
}
