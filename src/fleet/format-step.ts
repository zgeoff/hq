import type { EnsureStep } from './types.ts';

export function formatStep(s: EnsureStep): string {
  return (s.message ?? `${s.name} ${s.action}: ${s.detail}`).replace(/\.$/u, '');
}
