// The files the design and PR-walk briefs read from zgeoff/hq at a commit, with invented text in
// the real shape: each template's prompt in a text fence under a heading, and the two skills each
// brief points to. `without` leaves paths out.
export function buildStubSkillBriefKit(options: { without?: string[] } = {}): Record<string, string> {
  const files: Record<string, string> = {
    'agent-kit/design-brief.md': [
      '# Kettle design brief',
      '',
      'This line is not part of the prompt.',
      '',
      '```text',
      'Run a design session with me for {{issue_id}} in {{repo}}: a kettle that pours.',
      '',
      'Settle the spout first.',
      '```',
      '',
    ].join('\n'),
    'agent-kit/pr-walk-brief.md': ['# Kettle PR walk brief', '', '```text', '# Brief: going through the kettle PRs with the owner', '', 'Find out why each lid PR took rework.', '```', ''].join('\n'),
    'skills/tickets/SKILL.md': '# Tickets\n\nFile one issue per kettle fault.\n',
    'skills/fix-it-here/SKILL.md': '# Fix it here\n\nMend the lid in this PR.\n',
  };
  for (const path of options.without ?? []) {
    delete files[path];
  }
  return files;
}
