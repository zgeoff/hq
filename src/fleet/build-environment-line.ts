import { HqError } from '../errors.ts';

// One Environment= line, quoted; % is a systemd specifier, so it is doubled. A setting that holds a
// quote, a backslash or a newline is refused rather than escaped.
export function buildEnvironmentLine(unit: string, name: string, value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  if (/["\\\n\r]/u.test(value)) {
    throw new HqError('bad_config', `${name} holds a quote, a backslash or a newline, which the ${unit} unit cannot carry`, { setting: name });
  }
  return [`Environment="${name}=${value.replaceAll('%', '%%')}"\n`];
}
