export type CapState = 'none' | 'set';

export type CapAction = 'cap-set' | 'cap-off' | 'cap-ended';

// The moves of the stored cap. Setting replaces a cap that is already set.
export const CAP_TRANSITIONS: Record<CapAction, { from: readonly CapState[]; to: CapState }> = {
  'cap-set': { from: ['none', 'set'], to: 'set' },
  'cap-off': { from: ['set'], to: 'none' },
  'cap-ended': { from: ['set'], to: 'none' },
};
