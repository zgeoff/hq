import type { GoalKey } from './goal-keys.ts';
import type { Target } from './types.ts';

// "<20% by 2 Nov", "<15 min a week, each outage caught within 5 min", "<=$50 a month on Actions"
export function targetLine(key: GoalKey, t: Target | null): string {
  if (!t) return 'none yet';
  if (key === 'cost') {
    return `${t.op}$${t.value} a month on Actions`;
  }
  if (key === 'downtime') return `${t.op}${t.value} min a week${t.detectMax !== undefined ? `, each outage caught within ${t.detectMax} min` : ''}`;
  return `${t.op}${t.value}%${t.until ? ` by ${day(t.until)}` : ''}`;
}

const day = (d: string) => new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${d}T00:00:00Z`));
