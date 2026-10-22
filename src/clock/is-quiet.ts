import { getSydneyParts } from './get-sydney-parts.ts';
import { quietWindow } from './quiet-window.ts';

export function isQuiet(d: Date): boolean {
  const hour = getSydneyParts(d).hour,
    window = quietWindow();
  if (window.start === window.end) {
    return false;
  }
  return window.start < window.end ? hour >= window.start && hour < window.end : hour >= window.start || hour < window.end;
}
