import { z } from 'zod';
import { config } from '../../config/config.ts';
import { HqError } from '../../errors.ts';
import { parseJSON } from '../../noslop/parse-json.ts';

export type SlotOpToken = { kind: 'ready'; token: string } | { kind: 'not-set-up'; reason: string };

const SETTINGS = z.object({ env: z.object({ OP_SERVICE_ACCOUNT_TOKEN: z.string().min(1) }).partial() });

export async function readSlotOpToken(): Promise<SlotOpToken> {
  const path = config().HQ_SLOTS_OP_SETTINGS ?? `${process.env['HOME']}/projects/hq/.claude/settings.local.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return { kind: 'not-set-up', reason: `no settings file at ${path}` };
  }
  const text = await file.text();
  const raw = parseJSON(text);
  if (raw === undefined) {
    throw new HqError('bad_config', `the slot reads' settings file is not valid JSON: ${path}`);
  }
  const settings = SETTINGS.safeParse(raw);
  const token = settings.success ? settings.data.env.OP_SERVICE_ACCOUNT_TOKEN : undefined;
  if (token === undefined) {
    return { kind: 'not-set-up', reason: `no env.OP_SERVICE_ACCOUNT_TOKEN in ${path}` };
  }
  return { kind: 'ready', token };
}

