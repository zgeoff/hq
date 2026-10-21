import type { Capacity } from './types.ts';

// Agent slots that could launch now: imp room in units of one imp, when an
// unattended provider that runs on imp has quota.
export function slotsFrom(cap: Capacity, impMib: number): { freeMib: number | null; slots: number } {
  const free = typeof cap.imp?.freeMib === 'number' ? cap.imp.freeMib : null;
  const provider = Object.values(cap.providers ?? {}).some((p) => p.unattended && p.room && p.target === 'imp');
  if (free === null || !provider) return { freeMib: free, slots: 0 };
  return { freeMib: free, slots: Math.max(0, Math.floor(free / impMib)) };
}
