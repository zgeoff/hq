import type { BriefPlaybook } from './types.ts';

interface PointerFacts {
  issue: string;
  playbook: BriefPlaybook | null;
  byLink: boolean;
  goalFile: string | null;
}

// What {{goal_file}} holds: the sentence on the /goal line that sends the agent to the issue and
// its playbook, or nothing when there is nothing to send it to.
export function buildGoalPointer(facts: PointerFacts): string {
  if (facts.goalFile !== null) {
    return facts.playbook === null ? `. The full issue is in ${facts.goalFile}; read it first.` : `. The full issue and its playbook are in ${facts.goalFile}; read it first.`;
  }
  if (facts.byLink) {
    return facts.playbook === null ? `. First read ${facts.issue} with your own Linear access.` : `. First read ${facts.issue} with your own Linear access, then the ${facts.playbook.type} playbook: ${facts.playbook.command}`;
  }
  return facts.playbook === null ? '' : `. First read the ${facts.playbook.type} playbook: ${facts.playbook.command}`;
}
