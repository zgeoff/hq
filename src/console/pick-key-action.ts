export type KeyAction = { kind: 'pick'; index: number } | { kind: 'ask-stu' } | { kind: 'note' } | { kind: 'next' } | { kind: 'previous' } | { kind: 'help' } | { kind: 'close' };

export interface KeyInput {
  key: string;
  inText: boolean;
  modified: boolean;
}

// The Brief's keys, which work whenever focus is outside a text box: 1-9 pick, y Ask Stu, i into the
// note, j/k next and previous, ? the key list, Esc closes it. In the note, Esc steps back out.
export function pickKeyAction(input: KeyInput): KeyAction | null {
  if (input.inText) {
    return input.key === 'Escape' ? { kind: 'close' } : null;
  }
  if (input.modified) {
    return null;
  }
  if (/^[1-9]$/u.test(input.key)) {
    return { kind: 'pick', index: Number(input.key) - 1 };
  }
  return KEYS[input.key] ?? null;
}

const KEYS: Record<string, KeyAction> = {
  y: { kind: 'ask-stu' },
  i: { kind: 'note' },
  j: { kind: 'next' },
  k: { kind: 'previous' },
  '?': { kind: 'help' },
  Escape: { kind: 'close' },
};
