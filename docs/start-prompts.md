# start prompts

A start prompt tells one `z-` session who it is, what to load and what it may do. The session's role skill says how to do the work, so a line stays in the prompt only when the session needs it on every turn and no skill holds it. Every prompt follows the shape below, and `scripts/grants.ts` writes its grants block from the session's grants file. The examples use an invented session, `z-lantern`, that tends harbour lamps.

## the text block

The prompt is the one `text` block in the session's `references/session-prompt.md` ([sessions.md](./sessions.md#starting-a-session) says where the file lives). It has no headings and holds four parts in this order:

1. **Who you are.** The session's name, one sentence on the job that points at the role skill, then the rest of the team as a bulleted list with one line per session.
2. **What to load.** The skills as a bulleted list of paths in the hq checkout, with when to read each. Then the checkout rule: never fetch or pull, and run `hq defs sync` for a change that merged a moment ago. Then the session's state file.
3. **What you may do.** The grants block, headed `You are allowed to:`. The script writes it.
4. **The limits.** What the session never does, as a `You never:` bulleted list, then rules such as quiet hours.

```text
You are z-lantern. You tend the harbour lamps; the lamp-tending skill says how.

The rest of the team:

- z-keeper: assigns the night's rounds.
- z-ferry: reports the tide.

Read these in the hq checkout:

- skills/lamp-tending/SKILL.md: before each round.

Never fetch or pull the checkout. Run `hq defs sync` for a change that merged a moment ago.
Your state file is state/z-lantern.md.

You are allowed to:

- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.

You never:

- Move a lamp from its post.

Quiet hours are midnight to four.
```

## grants

A grant is one permission and its limit. Edit `grants/<session>.yaml` in hq-private and run `bun scripts/grants.ts --private <dir>`. Never edit the block by hand: `--check` fails on a hand edit.

- Write each note as one full sentence of 50 words or fewer that starts with the verb. The script counts the words as written in the YAML and fails over the cap.
- Put steps in the role skill and point at it, such as "as the release skill says". A grant with a checklist or more than one command is a procedure, and belongs in the skill.
- Leave the issue, the incident and the date out of the note. Put the owner's words in `source`, which the script never renders.
- Give a one-time grant an `until` date. Once today is after it, `--check` and a write both fail, naming the file and the id. `--today YYYY-MM-DD` sets the date for a test.
- Set `log: true` on a grant that stands in for the owner's yes. The rendered bullet then tells the session to log each use with `hq grant act`.
- Point at the `owner-calls` skill for the list of the owner's calls. Do not copy the list into the prompt.

```yaml
- id: oil
  label: "Oil"
  outcome: allow
  note: "Refill a lamp from the shed barrel when it runs low."
  source: "The keeper, 2026-03-02: refill them yourself."
  until: 2026-12-31
  log: true
```

The script renders that grant as this bullet:

```text
- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.
```

A prompt that still opens its block with `Grants:` keeps the old form, rendered as before, and takes no limits list after the block. Use `You are allowed to:` for a new prompt.
