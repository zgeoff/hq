import type { OpenDesignRuns } from '../lanes/count-open-design-runs.ts';
import type { DesignLane } from '../lanes/design-lane.ts';
import type { DesignSlots } from '../lanes/types.ts';
import type { RunState } from '../transitions/run-states.ts';

export interface RunAdmissionFacts {
  issue: string;

  // The closed run the issue already has, if any; an open one never reaches this choice.
  prior: { state: RunState; designLane: DesignLane | null } | null;
  isDesignType: boolean;
  design: DesignLane | null;
  asked: string | null;
  open: OpenDesignRuns;

  // The issues of the open design passes in each lane, for the refusal text.
  openIssues: { agent: string[]; withGeoff: string[] };
  slots: DesignSlots;
  designError: string | null;
}

export type RunAdmission = { kind: 'add'; designLane: DesignLane | null } | { kind: 'move'; designLane: DesignLane; from: RunState } | { kind: 'refused'; code: string; message: string; data?: Record<string, unknown> };

// The design lane is the --design flag, else with-geoff for a Design-type issue. A pass above its lane
// count is refused: an agent pass always, a with-geoff pass unless the owner asked for it somewhere.
export function pickRunAdmission(facts: RunAdmissionFacts): RunAdmission {
  const issue = facts.issue;
  const prior = facts.prior;
  if (prior?.designLane && facts.design) {
    return { kind: 'refused', code: 'bad_state', message: `${issue}: its ${prior.designLane} design pass is ${prior.state}; a new design pass needs hq run reopen ${issue}` };
  }
  if (prior?.designLane && facts.asked) {
    return { kind: 'refused', code: 'bad_args', message: `--asked goes with a new with-geoff design pass; hq run add without --design turns ${issue}'s ${prior.state} design pass into the build run` };
  }
  if (prior?.designLane) {
    return { kind: 'move', designLane: prior.designLane, from: prior.state };
  }
  if (prior) {
    return { kind: 'refused', code: 'bad_state', message: `${issue} is ${prior.state}: hq run reopen ${issue}` };
  }
  const lane = facts.design ?? (facts.isDesignType ? 'with-geoff' : null);
  if (facts.asked && lane === null) {
    return { kind: 'refused', code: 'bad_args', message: `--asked goes with a with-geoff design pass, and ${issue} gets a delivery run: pass --design with-geoff for a design pass` };
  }
  if (facts.asked && lane === 'agent') {
    return { kind: 'refused', code: 'bad_args', message: '--asked goes with a with-geoff design pass, not an agent one' };
  }
  if (lane === null) {
    return { kind: 'add', designLane: null };
  }
  if (facts.designError) {
    return { kind: 'refused', code: 'no_lanes', message: `${facts.designError}; hq adds no design pass until pacing.json gives its counts` };
  }
  if (lane === 'agent' && facts.open.agent >= facts.slots.agent) {
    return {
      kind: 'refused',
      code: 'design_full',
      message: `${issue}: all ${facts.slots.agent} agent design passes are open (${facts.openIssues.agent.join(', ') || 'none'}); close one with hq run done first`,
      data: { lane, open: facts.open.agent, slots: facts.slots.agent },
    };
  }
  if (lane === 'with-geoff' && facts.open.withGeoff >= facts.slots.withGeoff && !facts.asked) {
    return {
      kind: 'refused',
      code: 'design_full',
      message: `${issue}: the with-geoff design lane is full at ${facts.slots.withGeoff} (${facts.openIssues.withGeoff.join(', ') || 'none'}); pass --asked <where the owner asked> to add it above the count`,
      data: { lane, open: facts.open.withGeoff, slots: facts.slots.withGeoff },
    };
  }
  return { kind: 'add', designLane: lane };
}
