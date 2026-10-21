import { z } from 'zod';
import { HqError } from '../errors.ts';

const PACKAGE = z.object({ component: z.string().optional(), 'package-name': z.string().optional() });
const CONFIG = z.object({ packages: z.record(z.string(), PACKAGE) });

export function parseChangedPrefixes(configBase64: string, files: string[]): string[] {
  const configText = Buffer.from(configBase64.replaceAll(/\s/gu, ''), 'base64').toString('utf8');
  const config = parseJSON(CONFIG, configText, 'release-please-config.json');
  const prefixes: string[] = [];
  for (const [path, entry] of Object.entries(config.packages)) {
    if (path !== '.' && !files.some((file) => file.startsWith(`${path}/`))) {
      continue;
    }
    const name = entry.component ?? entry['package-name'];
    if (!name) {
      throw new HqError('bad_config', `release-please package ${path} has no component or package-name`);
    }
    prefixes.push(`${name}@`);
  }
  return prefixes;
}

function parseJSON<T>(schema: z.ZodType<T>, text: string, what: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new HqError('bad_config', `${what} is not JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HqError('bad_config', `${what} is not the expected shape`);
  }
  return parsed.data;
}
