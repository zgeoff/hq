import table from '../../lanes.json';
import { config } from '../config/config.ts';

// The installed hq carries the lanes.json it was built with.
export function checkLanesBuild(readText: (path: string) => string, path = `${config().HQ_PROJECTS ?? `${process.env['HOME']}/projects`}/hq/lanes.json`): string | null {
  let source: unknown;
  try {
    source = JSON.parse(readText(path));
  } catch {
    return null;
  }
  if (JSON.stringify(source) === JSON.stringify(table)) {
    return null;
  }
  return `the installed hq carries an older lanes.json than ${path}: the Ready read uses the old rules until \`bun run install-bin\` runs there`;
}
