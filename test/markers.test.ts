import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A merge or stash conflict inside a string (the help text) passes the typecheck; catch it here.
test('no source file holds a conflict marker', () => {
  const root = join(import.meta.dir, '..');
  const files = ['src', 'test', 'scripts'].flatMap((d) => readdirSync(join(root, d), { recursive: true }).map((f) => join(root, d, String(f)))).filter((f) => /\.(ts|sh|md|json)$/.test(f));
  const hits = files.filter((f) => /^(<{7}|>{7}|\|{7})( |$)/m.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});
