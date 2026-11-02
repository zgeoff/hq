export function buildActionsBudget(monthly: number, at: Date): number {
  const days = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  return (monthly * at.getUTCDate()) / days;
}
