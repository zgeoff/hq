import { createContext, useContext } from 'react';
import type { ConsoleAPI } from './console-api.ts';

// The console API the page entry built, for every view under it.
export const ConsoleAPIContext = createContext<ConsoleAPI | null>(null);

export function useConsoleAPI(): ConsoleAPI {
  const api = useContext(ConsoleAPIContext);
  if (api === null) {
    throw new Error('a console view needs a ConsoleAPIContext provider above it');
  }
  return api;
}
