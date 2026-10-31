interface KettleIssueParts {
  context?: string;
  scope?: string;
  actions?: string;
}

// The description of an invented kettle issue, with every section a ready issue holds. A part the
// caller gives replaces that section's body.
export function buildKettleIssueText(parts: KettleIssueParts = {}): string {
  const context = parts.context ?? 'It leaks at the lid.';
  const scope = parts.scope ?? 'In: the lid.\nOut: none stated.';
  const actions = parts.actions ?? 'Code delivery';
  return `## Outcome\n\nA kettle that boils.\n\n## Context\n\n${context}\n\n## Scope\n\n${scope}\n\n## Acceptance\n\n- [ ] it boils\n\n## Actions\n\n${actions}\n\n## Agent notes\n\nMind the seal.\n`;
}
