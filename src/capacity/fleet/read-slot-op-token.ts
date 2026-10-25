import { z } from 'zod';
import { HqError } from '../../errors.ts';
import { parseJSON } from '../../noslop/parse-json.ts';
import type { SlotSettings } from './types.ts';

export type SlotOpToken = { kind: 'ready'; token: string } | { kind: 'not-set-up'; reason: string };

const SETTINGS = z.object({ env: z.object({ OP_SERVICE_ACCOUNT_TOKEN: z.string().min(1) }).partial() });

export async function readSlotOpToken(settings: SlotSettings): Promise<SlotOpToken> {
  const path = settings.path;
  const text = await settings.readFile(path);
  if (text === null) {
    return { kind: 'not-set-up', reason: `no settings file at ${path}` };
  }
  const raw = parseJSON(text);
  if (raw === undefined) {
    throw new HqError('bad_config', `the slot reads' settings file is not valid JSON: ${path}`);
  }
  const parsed = SETTINGS.safeParse(raw);
  const token = parsed.success ? parsed.data.env.OP_SERVICE_ACCOUNT_TOKEN : undefined;
  if (token === undefined) {
    return { kind: 'not-set-up', reason: `no env.OP_SERVICE_ACCOUNT_TOKEN in ${path}` };
  }
  return { kind: 'ready', token };
}
