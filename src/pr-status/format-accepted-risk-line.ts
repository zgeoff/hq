import type { AcceptedRiskView } from './types.ts';

export function formatAcceptedRiskLine(risk: AcceptedRiskView): string {
  const noslop = risk.noslopState === null ? `noslop's state could not be read (${risk.noslopError ?? 'no reason given'})` : `noslop reads ${risk.noslopState}`;
  return `accepted risk ${risk.finding} (${risk.source}, event ${risk.event}): ${noslop}`;
}
