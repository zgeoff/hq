import type { ConsoleTab } from './console-tab-list.ts';
import { CONSOLE_TAB_LIST } from './console-tab-list.ts';

export interface TabKeyInput {
  key: string;
  inText: boolean;
  modified: boolean;
  current: ConsoleTab;

  // When `g` was pressed, if it still waits for its second key; and the time now, in ms.
  pendingSince: number | null;
  now: number;
}

export interface TabKeyPlan {
  pendingSince: number | null;
  go: string | null;
  consumed: boolean;
}

// The keys that move between tabs on every tab: `g` then a tab's key jumps to it, `[` and `]` step.
// A `g` waits 1.5 s for its second key; any other key ends the wait and acts as it would alone.
// None fires in a text box or with a modifier, and a key they don't use passes on to the tab.
export function planTabKey(input: TabKeyInput): TabKeyPlan {
  const PENDING_MS = 1500,
    pending = input.pendingSince !== null && input.now - input.pendingSince <= PENDING_MS,
    target = pending ? CONSOLE_TAB_LIST.find((entry) => entry.key === input.key) : undefined;
  if (input.inText || input.modified) {
    return { pendingSince: null, go: null, consumed: false };
  }
  if (target !== undefined) {
    return { pendingSince: null, go: target.path, consumed: true };
  }
  if (input.key === 'g') {
    return { pendingSince: input.now, go: null, consumed: true };
  }
  return { pendingSince: null, go: findStep(input.current, STEPS[input.key] ?? 0), consumed: input.key in STEPS };
}

const STEPS: Record<string, number> = { '[': -1, ']': 1 };

// The path `step` tabs on from the current one, wrapping round; none for a step of 0.
function findStep(current: ConsoleTab, step: number): string | null {
  if (step === 0) {
    return null;
  }
  const at = CONSOLE_TAB_LIST.findIndex((entry) => entry.tab === current),
    count = CONSOLE_TAB_LIST.length;
  return CONSOLE_TAB_LIST[(((at + step) % count) + count) % count]?.path ?? null;
}
