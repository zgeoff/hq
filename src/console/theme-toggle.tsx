import { useState } from 'react';
import { writeTheme } from './write-theme.ts';

// The sun/moon button. The page follows the system theme until the owner picks one, and keeps their pick
// across tabs and reloads.
export function ThemeToggle() {
  const [dark, setDark] = useState(() => readStartsDark());
  return (
    <button
      className="hq-icon"
      type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        writeTheme(document.documentElement, () => globalThis.localStorage, next);
        setDark(!dark);
      }}
    >
      {dark ? (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" />
        </svg>
      )}
    </button>
  );
}

function readStartsDark(): boolean {
  const set = document.documentElement.dataset['theme'];
  if (set !== undefined) {
    return set === 'dark';
  }
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}
