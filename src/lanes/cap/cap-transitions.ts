export type CapState = 'none' | 'set' | 'bad';

export type CapAction = 'cap-set' | 'cap-off' | 'cap-ended';

export const CAP_TRANSITIONS: Record<CapAction, { from: readonly CapState[]; to: CapState }> = {
  'cap-set': { from: ['none', 'set', 'bad'], to: 'set' },
  'cap-off': { from: ['set', 'bad'], to: 'none' },
  'cap-ended': { from: ['set'], to: 'none' },
};
