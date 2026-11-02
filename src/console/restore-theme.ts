import { THEME_KEY } from './theme-key.ts';

export function restoreTheme(root: HTMLElement, readStorage: () => Storage): void {
  try {
    const theme = readStorage().getItem(THEME_KEY);
    if (theme === 'light' || theme === 'dark') {
      root.dataset['theme'] = theme;
    }
  } catch {
    // Storage that refuses (a private window, blocked site data) leaves the system theme.
  }
}
