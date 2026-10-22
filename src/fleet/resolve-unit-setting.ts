import { resolve } from 'node:path';
import { PATH_SETTINGS } from '../config/config.ts';

// A unit runs from another directory than the shell that wrote it, so a setting that names a file
// is made absolute against the writing shell's directory.
export function resolveUnitSetting(name: string, value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  const kind = PATH_SETTINGS.get(name);
  if (kind === 'paths') {
    return value
      .split(':')
      .map((part) => (part ? resolve(part) : part))
      .join(':');
  }
  return kind === 'path' ? resolve(value) : value;
}
