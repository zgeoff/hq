# anthropic guidance digest

Condensed authoring reference for refining Frankie's skills. Fetched 2026-10-06 from:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) (plus per-model pages linked there)

Re-fetch when a decision depends on exact wording; this is a digest, not a copy.

## skill structure

- Frontmatter `name`: ≤64 chars, lowercase letters/numbers/hyphens, no XML, no "anthropic"/"claude". Gerund form preferred (`processing-pdfs`); noun phrases acceptable; be consistent across the collection.
- Frontmatter `description`: non-empty, ≤1024 chars, no XML, **third person**, states both what the skill does and when to use it, with concrete trigger terms. It is the only thing seen at selection time among possibly 100+ skills.
- SKILL.md body under 500 lines; it is a table of contents pointing to references loaded on demand.
- References **one level deep** from SKILL.md (nested links get partially read, e.g. `head -100`). Files over 100 lines get a contents list at top.
- Descriptive file names, forward slashes, organise by domain so irrelevant material stays unloaded.
- MCP tools referenced by fully qualified name (`Server:tool`).

## content

- Claude is already smart: include only context it lacks; each paragraph must justify its tokens.
- Match degrees of freedom to fragility: heuristics for open judgement, exact steps/scripts for fragile sequences.
- One default plus an escape hatch, not a menu of options.
- Consistent terminology; pick one term per concept.
- No time-sensitive statements; put deprecated behaviour in an "old patterns" section.
- Concrete examples (input/output pairs) over abstract description; templates strict or flexible as the task needs.
- Complex workflows: numbered steps, optionally a copyable checklist; add feedback loops (check → fix → recheck) for quality-critical work; conditional branches for decision points.

## prompting principles that apply to skill text

- Be clear and direct; the "new colleague with no context" test.
- Explain _why_ a rule exists; the model generalises from the reason better than from a bare NEVER.
- Say what to do rather than what not to do.
- Current models follow instructions closely and over-trigger on aggressive language ("CRITICAL", "MUST", "if in doubt, use X"). Use normal phrasing; reserve emphasis for rules that observed behaviour shows are being missed.
- Prefer general guidance over prescriptive step lists for reasoning; models' own reasoning often exceeds hand-written plans.
- Verification instructions can cause over-verification on newer models (notably Opus 5); add them where evaluation shows they're needed.
- Action vs suggestion: state explicitly whether the agent should act or propose. For reversible/irreversible actions, name which need confirmation.
- Agentic state: structured formats for status, free text for progress notes, git for checkpoints; investigate before claiming.
- Subagents/coordinators: use only for parallel, isolated, independent work.
- Newer models write fewer progress updates during agentic work; ask explicitly if updates matter.

## evaluation and iteration

- Build evaluations before extensive documentation: baseline without the skill → ≥3 scenarios targeting observed gaps → minimal instructions → iterate.
- "Claude A / Claude B" loop: one instance refines the skill, a fresh instance uses it on real tasks; bring observed failures back as specifics.
- Watch how the agent navigates: unexpected read order, missed references, over-read files (promote into SKILL.md), never-read files (cut or signal better).
- Test on every model the skill will run on (Haiku needs more guidance; Opus needs less explanation).

## checklist

- [ ] Description specific, third person, what + when, key terms
- [ ] Body < 500 lines; details in one-level-deep references
- [ ] No time-sensitive information
- [ ] Consistent terminology
- [ ] Concrete examples
- [ ] Workflows have clear steps and feedback loops where quality matters
- [ ] ≥3 evaluations; tested on target models and real usage
