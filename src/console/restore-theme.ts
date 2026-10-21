import { THEME_KEY } from './theme-key.ts';

// The theme the owner last picked, kept in this browser, so a tab change or a reload keeps it. Storage
// that refuses (a private window, blocked site data) leaves the system theme.
export function restoreTheme(root: HTMLElement, readStorage: () => Storage): void {
  try {
    const theme = readStorage().getItem(THEME_KEY);
    if (theme === 'light' || theme === 'dark') {
      root.dataset['theme'] = theme;
    }
  } catch {
    // The system theme stands.
  }
}
