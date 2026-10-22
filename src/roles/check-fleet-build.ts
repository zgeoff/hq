import { readFileSync } from 'node:fs';
import table from '../../fleet.json';
import { config } from '../config/config.ts';

// The installed hq carries the fleet.json it was built with. When the checkout's copy differs, a
// merged fleet change has not been installed, and spawns still use the old one. Null when they match
// or the checkout has no readable copy.
export function checkFleetBuild(path = `${config().HQ_PROJECTS ?? `${process.env['HOME']}/projects`}/hq/fleet.json`): string | null {
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (JSON.stringify(source) === JSON.stringify(table)) {
    return null;
  }
  return `the installed hq carries an older fleet.json than ${path}: spawns use the old one until \`bun run install-bin\` runs there`;
}
