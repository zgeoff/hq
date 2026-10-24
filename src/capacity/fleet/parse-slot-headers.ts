import { iso } from '../../clock/iso.ts';

interface SlotHeaders {
  five: number | null;
  fiveResetsAt: string | null;
  seven: number | null;
  sevenResetsAt: string | null;
}

// The utilization headers are fractions of 1 and the reset headers are epoch seconds.
export function parseSlotHeaders(headers: Headers): SlotHeaders {
  return {
    five: parsePercent(headers.get('anthropic-ratelimit-unified-5h-utilization')),
    fiveResetsAt: parseReset(headers.get('anthropic-ratelimit-unified-5h-reset')),
    seven: parsePercent(headers.get('anthropic-ratelimit-unified-7d-utilization')),
    sevenResetsAt: parseReset(headers.get('anthropic-ratelimit-unified-7d-reset')),
  };
}

function parsePercent(value: string | null): number | null {
  const fraction = value === null || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(fraction) && fraction >= 0 ? Math.round(fraction * 10_000) / 100 : null;
}

function parseReset(value: string | null): string | null {
  const seconds = value === null || value.trim() === '' ? Number.NaN : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? iso(new Date(seconds * 1000)) : null;
}
