import { THEME_KEY } from './theme-key.ts';

export function writeTheme(root: HTMLElement, readStorage: () => Storage, theme: 'light' | 'dark'): void {
  root.dataset['theme'] = theme;
  try {
    readStorage().setItem(THEME_KEY, theme);
  } catch {
  }
}
