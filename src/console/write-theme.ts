import { THEME_KEY } from './theme-key.ts';

// Shows the theme now and keeps it for the next page load; storage that refuses keeps it for this
// page only.
export function writeTheme(root: HTMLElement, readStorage: () => Storage, theme: 'light' | 'dark'): void {
  root.dataset['theme'] = theme;
  try {
    readStorage().setItem(THEME_KEY, theme);
  } catch {
    // This page still shows it.
  }
}
