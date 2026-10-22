// The part of a monthly budget for the UTC days of the month so far, today counted whole: $50 a
// month gives $50 × 20 / 31 on 20 October and the whole $50 on the last day.
export function buildActionsBudget(monthly: number, at: Date): number {
  const days = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  return (monthly * at.getUTCDate()) / days;
}
