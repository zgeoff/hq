export type ConsoleTab = 'needs-you' | 'shipped';

// The console's tabs in header order: each one's path, and the key after `g` that jumps to it.
export const CONSOLE_TAB_LIST: readonly { tab: ConsoleTab; path: string; label: string; key: string }[] = [
  { tab: 'needs-you', path: '/', label: 'Needs you', key: 'n' },
  { tab: 'shipped', path: '/shipped', label: 'Shipped', key: 's' },
];
