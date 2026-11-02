const PLACEHOLDER = /\{\{(?<name>\w+)\}\}/gu;

// One pass, so text that holds `{{x}}` is never filled again.
export function fillPlaceholders(template: string, values: Readonly<Record<string, string>>): { text: string; unknown: string[] } {
  const text = template.replaceAll(PLACEHOLDER, (whole, name: string) => (Object.hasOwn(values, name) ? (values[name] ?? whole) : whole));
  const names = [...template.matchAll(PLACEHOLDER)].map((match) => match.groups?.['name'] ?? '');
  return { text, unknown: [...new Set(names.filter((name) => !Object.hasOwn(values, name)))] };
}
