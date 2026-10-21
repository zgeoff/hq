import type { Database } from 'bun:sqlite';
import { buildActionsBudget } from './build-actions-budget.ts';
import { loadActionsSpend } from './load-actions-spend.ts';
import type { Target, Verdict } from './types.ts';
import { verdict } from './verdict.ts';

// The cost goal's spend text and colour: the month's Actions spend so far against the monthly
// target pro-rated to the days elapsed, both rounded to whole cents once and compared as
// integers, so a float sum such as 0.1 + 0.2 meets a budget of 0.30. An unknown spend gets no colour.
export function loadCostGoal(db: Database, target: Target | null, at: Date): { text: string; verdict: Verdict } {
  const budget = toCents(buildActionsBudget(target?.value ?? 0, at)),
    dollars = loadActionsSpend(db, at);
  if (dollars === null) {
    return { text: 'Actions spend unknown', verdict: 'none' };
  }
  return buildKnownCostGoal(toCents(dollars), budget, target);
}

function buildKnownCostGoal(spend: number, budget: number, target: Target | null): { text: string; verdict: Verdict } {
  if (!target) {
    return { text: `Actions ${formatCents(spend)} this month`, verdict: 'none' };
  }
  return {
    text: `Actions ${formatCents(spend)} of ${formatCents(budget)} budget to date`,
    verdict: verdict({ op: target.op, value: budget }, { value: spend, n: 1, unit: 'cents', shown: formatCents(spend), detail: '' }),
  };
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
