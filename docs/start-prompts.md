# start prompts

Write or change a `z-` session's start prompt by the shape below. [sessions.md](./sessions.md) says what each session does and how a prompt reaches it. Keep a line in the prompt only when the session needs it on every turn and no skill holds it: the session's role skill says how to do the work, and the prompt says who the session is and what it may do. The owner is the person the fleet works for. The examples use an invented session, `z-lantern`, that tends harbour lamps.

## the text block

Each prompt is the one `text` block in `skills/<role skill>/references/session-prompt.md` in hq-private, as [starting a session](./sessions.md#starting-a-session) says. Write the block with no Markdown headings, in this order:

1. **Who you are.** The session's name, one sentence on its job that points at the role skill, and the rest of the team as a bulleted list, one sentence per session.
2. **What to load.** The skills as a bulleted list of paths in the hq checkout, which is the session's working directory, and when to read them. Then the checkout rule: never fetch or pull, and run `hq defs sync` to get a change that merged a moment ago. Then the path of the session's state file.
3. **What you may do.** Type the line `You are allowed to:` and a blank line. `scripts/grants.ts` writes the grant bullets under that line.
4. **The limits.** What the session never does, as a `You never:` bulleted list, then any other rule the session follows on every turn, such as quiet hours.

```text
You are z-lantern. You tend the harbour lamps, as the lamp-tending skill says.

The rest of the team:

- z-keeper assigns the night's rounds.
- z-ferry reports the tide.

Your skills, in the hq checkout that is your working directory:

- `skills/lamp-tending/SKILL.md`

Read each skill at the start and after a compaction. Never fetch or pull in the checkout. To get a change that merged a moment ago, run `hq defs sync`.

Keep your state in ~/.local/share/z-sessions/lantern.md.

You are allowed to:

- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.

You never:

- Move a lamp from its post.

Send nothing between midnight and 04:00.
```

## grants

Each grant gives the session one permission and its limit, both in the grant's `note`. Its YAML file and the prompt both live in hq-private, so a grant change is one hq-private PR.

1. Edit `grants/<session name>.yaml` in hq-private, such as `grants/z-lantern.yaml`.
2. From the root of an hq checkout, run `bun scripts/grants.ts --private <path to the hq-private checkout>`. `hq defs` prints that path. Expect `grants: wrote <n> files`.
3. Run the same command with `--check` before you commit. Expect `grants: <n> files match`.

Never edit the bullets by hand: `--check` fails on a hand edit.

Write each grant by these rules:

- Write the `note` as full sentences, 50 words or fewer, starting with the verb. The script counts the note's words, not the log sentence it adds, and fails over the cap.
- Put steps in the role skill, and point at the skill from the note, such as "as the release skill says". A note with a checklist or more than one command holds a procedure, which belongs in the skill.
- Leave out of the note any issue, incident or date that led to the grant. Put the owner's words, with where and when the owner gave them, in `source`. The script never renders `source`.
- Give a one-time grant an `until` date. Once today is after that date, the script fails, with or without `--check`, and names the file and the grant's `id`. `--today YYYY-MM-DD` sets the date for a test.
- Set `log: true` on a grant that lets the session act where it would otherwise ask the owner. The script then adds a sentence that tells the session to record each use with `hq grant act <session name>-<id>`.
- To keep a decision with the owner, point the note at the `owner-calls` skill, which lists the decisions only the owner makes. Never copy that list into a note.

Give each grant a short, lowercase `id`, unique in its file, and a `label`, which `hq grant` shows. Set `outcome` to `allow`: the script rejects any other value.

```yaml
- id: oil
  label: "Oil"
  outcome: allow
  note: "Refill a lamp from the shed barrel when it runs low."
  source: '"refill them yourself." (the keeper, chat, 2026-03-02)'
  until: 2026-12-31
  log: true
```

The script renders that grant as this bullet:

```text
- Refill a lamp from the shed barrel when it runs low. Log it with `hq grant act z-lantern-oil --target <what you acted on>`.
```

## the older form

The script renders a grants list in one of two forms, and picks the form from the line above the list. Under `Grants:`, it renders each grant as `- <label>: <note>`, and refuses a bulleted list after the grants list. When you change a prompt that still uses `Grants:`, move it to `You are allowed to:` and the shape above.
