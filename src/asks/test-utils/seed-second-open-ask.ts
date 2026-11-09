import type { AddInput } from '../types.ts';
import { seedAsk } from './seed-ask.ts';
import type { AsksDeps } from './types.ts';

export function seedSecondOpenAsk(deps: AsksDeps, input: Partial<AddInput> = {}): void {
  const ask = seedAsk(deps, input);

  // A second ask open beside one already open: openAsk refuses it first, so only the unique index on open asks stops this write.
  deps.db.query(`UPDATE asks SET state='open' WHERE id=?`).run(ask.id);
}
