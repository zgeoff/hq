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
    'agent-kit/agent-design-brief.md': [
      '# Kettle agent design brief',
      '',
      '```text',
      '/goal A kettle record for {{issue_id}}. Read the playbook: {{playbook}}',
      '',
      'Permissions: {{record_line}} Commit nothing.{{permissions}}',
      '',
      'Check the spout: {{check_sketches}}',
      '```',
      '',
    ].join('\n'),
    'agent-kit/playbooks/design.md': '# Design\n\nPour before you decide.\n',
    'agent-kit/pr-walk-brief.md': ['# Kettle PR walk brief', '', '```text', '# Brief: going through the kettle PRs with the owner', '', 'Find out why each lid PR took rework.', '```', ''].join('\n'),
    'skills/tickets/SKILL.md': '# Tickets\n\nFile one issue per kettle fault.\n',
    'skills/fix-it-here/SKILL.md': '# Fix it here\n\nMend the lid in this PR.\n',
  };
  for (const path of options.without ?? []) {
    delete files[path];
  }
  return files;
}
