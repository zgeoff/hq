import { resolve } from 'node:path';
import { HqError } from '../errors.ts';

// A timer's service runs with systemd's environment, not the installing shell's, so it carries the
// shell's HQ_* settings and the XDG_CONFIG_HOME that locates the local settings file; HQ_DB is made
// absolute because the service runs from another directory.
export function buildUnitSettings(unit: string, env: Record<string, string | undefined>): string {
  return Object.entries(env)
    .filter(([name]) => (name.startsWith('HQ_') && name !== 'HQ_AS') || name === 'XDG_CONFIG_HOME')
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, value]) => buildEnvironmentLine(unit, name, resolveSetting(name, value)))
    .join('');
}

// One Environment= line, quoted; % is a systemd specifier, so it is doubled. A setting that holds a
// quote, a backslash or a newline is refused rather than escaped.
function buildEnvironmentLine(unit: string, name: string, value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (/["\\\n\r]/u.test(value)) {
    throw new HqError('bad_config', `${name} holds a quote, a backslash or a newline, which the ${unit} unit cannot carry`, { setting: name });
  }
  return [`Environment="${name}=${value.replaceAll('%', '%%')}"\n`];
}

function resolveSetting(name: string, value: string | undefined): string | undefined {
  return name === 'HQ_DB' && value ? resolve(value) : value;
}
