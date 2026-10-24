import type { BurnWindow, CapacityHint } from './build-capacity-hint.ts';
import type { LimitProjection } from './build-limit-projection.ts';

export function formatCapacityHint(hint: CapacityHint): string[] {
  const account = hint.account === null ? '' : `, account ${hint.account}`;
  return [
    `Claude burn, last ${hint.hours} h${account}:`,
    ...hint.windows.map((window) => `  ${formatWindow(window, hint)}`),
    `  working sessions: ${hint.working.average} (${hint.working.basis})`,
  ];
}

function formatWindow(window: BurnWindow, hint: CapacityHint): string {
  const span = window.reset && window.since !== null ? `since ${formatClock(window.since)} (window reset)` : `last ${hint.hours} h`;
  const head = `${window.window}, ${span}, ${window.samples} sample${window.samples === 1 ? '' : 's'}`;
  if (window.ratePerHour === null || window.latest === null || window.atRate === null) {
    return `${head}: too few samples`;
  }
  const rate = `${window.latest.toFixed(1)}% now, ${formatRate(window.ratePerHour)}%/h (${window.method})`;
  const atRate = `at today's rate ${formatProjection(window.atRate, hint.limit)}`;
  const atCap = window.atCap === null || hint.cap === null ? '' : `; at the cap of ${hint.cap} (${formatRate(window.atCap.ratePerHour)}%/h) ${formatProjection(window.atCap, hint.limit)}`;
  return `${head}: ${rate}; ${atRate}${atCap}`;
}

function formatClock(time: string): string {
  const date = new Date(time);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}Z`;
}

function formatRate(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}`;
}

function formatProjection(projection: LimitProjection, limit: number): string {
  if (projection.kind === 'reached') {
    return `${limit}% reached`;
  }
  return projection.kind === 'flat' ? `${limit}% not approached` : `${limit}% in ${projection.hours.toFixed(1)} h (${projection.at})`;
}
