import { mkdirSync, writeFileSync } from 'node:fs';
import { INSTALL_MARKER } from '../src/noslop/install-marker.ts';

// A noslop clone folder that hq treats as installed, whose load-store.ts names the given migrations
// as the keys of an object, the way noslop's does.
export function createStubNoslopClone(clone: string, migrations: string[]): void {
  mkdirSync(`${clone}/node_modules`, { recursive: true });
  writeFileSync(`${clone}/${INSTALL_MARKER}`, '');
  mkdirSync(`${clone}/adapters/sqlite/src`, { recursive: true });
  const entries = migrations.map((name) => `  '${name}': {\n    up: async () => {},\n  },`);
  writeFileSync(`${clone}/adapters/sqlite/src/load-store.ts`, `const STORE_MIGRATIONS = {\n${entries.join('\n')}\n};\n`);
}
