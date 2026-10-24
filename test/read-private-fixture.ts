import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The still-ask list is invented, and so is every file the grants check reads, so the fixture
// never depends on the text hq or hq-private hold. The script is the repo's own.
const ROLE_SKILLS = [
  "delivery-lead",
  "intake",
  "linear-triage",
  "pr-review",
  "preview-qa",
  "release",
];
const SPAN = "deleting or rewriting the kettle's water, a priority, and a High security change";
const STILL_ASK = [
  "items:",
  "  - id: water",
  "    outcome: ask",
  `    note: "deleting or rewriting the kettle's water"`,
  "  - id: priority",
  "    outcome: ask",
  '    note: "a priority"',
  "  - id: danger",
  "    outcome: ask",
  '    note: "a High security change"',
  "sites:",
  "  - file: skills/linear-triage/SKILL.md",
  "    voice: third",
  '    after: "."',
  "  - file: skills/intake/references/session-prompt.md",
  "    voice: first",
  '    after: "."',
  "  - file: docs/skill-development/roles-design.md",
  "    voice: third",
  '    after: "."',
  "",
].join("\n");

function buildStubPrompt(skill: string): string {
  return `# session prompt\n\n\`\`\`text\nYou are an invented ${skill}.\n\`\`\`\n`;
}

interface PrivateFixture {
  hqFiles: Record<string, string>;
  privateFiles: Record<string, string>;
}

// What a full `hq defs check` needs of each tree. hq-defs holds the grants script, the still-ask
// list and one public site. hq-private holds the six start prompts (the qa one with a Grants block),
// its grant file and a doc site.
export function readPrivateFixture(): PrivateFixture {
  const privateFiles = Object.fromEntries(
    ROLE_SKILLS.map((skill) => [
      `skills/${skill}/references/session-prompt.md`,
      buildStubPrompt(skill),
    ]),
  );
  privateFiles["skills/intake/references/session-prompt.md"] += `\nAsk before ${SPAN}.\n`;
  privateFiles["skills/preview-qa/references/session-prompt.md"] =
    "# session prompt\n\nThe start prompt for `z-qa`.\n\n```text\nYou are an invented qa.\n\nGrants:\n- Water: pour the water.\n\nThen stop.\n```\n";
  privateFiles["grants/z-qa.yaml"] =
    '- id: water\n  label: Water\n  outcome: allow\n  note: "pour the water."\n';
  privateFiles["docs/skill-development/roles-design.md"] = `Ask before ${SPAN}.\n`;
  privateFiles["prompts/z-q.md"] = "You are an invented developer.\n";
  return {
    hqFiles: {
      "scripts/grants.ts": readFileSync(resolve(import.meta.dir, "../scripts/grants.ts"), "utf8"),
      "grants/still-ask.yaml": STILL_ASK,
      "skills/linear-triage/SKILL.md": `Ask before ${SPAN}.\n`,
    },
    privateFiles,
  };
}
