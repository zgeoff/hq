import type { AddRunInput } from '../types.ts';

export function buildMockAddRunInput(input: Partial<AddRunInput> = {}): AddRunInput {
  return { issue: 'GEO-9001', title: 'Invented kettle work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, actor: 'delivery-bot', ...input };
}
