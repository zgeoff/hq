import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubNoslopClone } from './create-stub-noslop-clone.ts';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-stub-clone-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return { dir };
}

test('it writes a load-store.ts that names each migration as a quoted key', () => {
  const ctx = setupTest();

  createStubNoslopClone(join(ctx.dir, 'clone'), ['0001-a', '0002-b']);

  expect(readFileSync(join(ctx.dir, 'clone/adapters/sqlite/src/load-store.ts'), 'utf8')).toBe("const STORE_MIGRATIONS = {\n  '0001-a': {\n    up: async () => {},\n  },\n  '0002-b': {\n    up: async () => {},\n  },\n};\n");
});
