// The files hq brief reads from zgeoff/hq at a commit, with invented text in the real shape: the
// template in a text fence under a comment, the stack and imp lines in briefs.md, the review block
// in review-lines.md, and two playbooks. `without` leaves paths out.
export function buildStubBriefKit(options: { without?: string[] } = {}): Record<string, string> {
  const files: Record<string, string> = {
    'agent-kit/brief.md': [
      '<!--',
      'The kettle brief. This comment is not part of the prompt.',
      '-->',
      '',
      '```text',
      '/goal A ready PR in {{repo}} for {{issue_id}}{{goal_file}}',
      '',
      '{{issue}}',
      '',
      'Permissions:',
      '{{permissions}}',
      '',
      '{{stack}}',
      'Finish line: a ready PR in {{repo}} whose description holds "{{fixes}} {{issue_id}}".',
      'Boil the water. {{review_lines}} Leave the lid to me.{{not_yours}}',
      '{{imp_line}}',
      'Send a note when done.',
      '```',
      '',
    ].join('\n'),
    'skills/delivery-lead/references/briefs.md': [
      '# Briefs',
      '',
      'The stack line:',
      '',
      '```text',
      'STACK-LINE: build this in layers.',
      '```',
      '',
      'The imp line:',
      '',
      '```text',
      'IMP-LINE: this imp has a small kettle.',
      '```',
      '',
    ].join('\n'),
    'agent-kit/review-lines.md': ['# kettle review', '', 'Put this block in the brief.', '', '```text', 'REVIEW-LINES: list findings with gh api repos/zgeoff/<repo>/pulls/<n>/comments.', '```', ''].join('\n'),
    'agent-kit/playbooks/bug.md': '# Bug playbook\n\nReproduce the leak first.\n',
    'agent-kit/playbooks/feature.md': '# Feature playbook\n\nShip it small.\n',
  };
  for (const path of options.without ?? []) {
    delete files[path];
  }
  return files;
}
