# Holds

Two holds stop a merge: the owner's lgtm, which `hq review gate` enforces from hq's records, and a
preview check, which you enforce. Each record is tied to one head commit, and a push voids it. Never
pass an lgtm on by message.

## The owner's lgtm

A PR is held when it changes:

- a repo's `AGENTS.md`;
- a skill: its `SKILL.md`, references or scripts;
- in zgeoff/hq and zgeoff/hq-private, also [fleet.json](../../../fleet.json), `grants/` or the
  session docs in `docs/`.

Not held: test files or data in a skill folder; a bot's PR (except repo-sync, which needs its
record); anything in zgeoff/nixie-definitions.

In zgeoff/hq and zgeoff/hq-private only his lgtm clears it. Elsewhere, one of these records you make
also clears it, at the PR's head. If hq refuses the record, the PR waits for him.

- **Mechanical edit:** `hq pr mechanical <repo> <pr>`. hq passes only a moved link or path, a
  version number, or a re-padded table.
- **Content-free rebase:** `hq pr rebased <repo> <pr> --from <old head>`, when his lgtm is the
  newest answer at the old head. hq carries it over only if the PR's patch-id matches.
- **Exception:** `hq pr exempt <repo> <pr> --rule <rule> --note <why>`, with one of:
  - `formatting`: no change inside a code block, or to any command, YAML or JSON line, whitespace
    included. Read the raw diff: `git diff -w` hides code-block whitespace.
  - `rename`: only renames, and `scripts/rename-pr.sh <repo> <pr>` prints `ok`.
  - `repo-sync`: a PR the repo-sync workflow opened.
  - `ci-design-sync`: only rolls out or syncs the shared ci-design skill. A new ci-design rule waits
    for him.

File each PR waiting on him with
`hq unblock add --task '<lgtm repo#n: what it changes>' --done-when pr:<repo>#<n>`. A question
beyond the lgtm goes to `z-triage` as a call.

## His answer

`z-stu` records it with `hq pr answer`; read it with `hq pr status <repo> <pr>`.

- **lgtm:** merge once the gate passes.
- **changes:** send his note to the agent as a finding.
- **none yet, or "later":** the PR waits.
- **reject:** `gh pr close <n> -R zgeoff/<repo> --comment "Closed: rejected in review."`, and send
  his note to `z-delivery`.

If an answer's source looks wrong, `skills/pr-review/references/holds.private.md` in hq-private
(`hq defs` shows where) says which sources count.

## A preview check

Some repos deploy each PR to a preview and comment its URL. `z-qa` checks the issue's live
Acceptance items there before the merge, since the preview ends when the PR closes.

1. Wait for the FINAL note and a preview comment naming the PR's head.
2. Message `z-qa` the issue, PR, head and live items.
3. Merge once `z-qa`'s evidence comment for that head is on the issue and the gate passes.

A failed item is a finding for the agent. An item that needs the owner goes on his list with
`hq unblock add --task '<what he checks>' --done-when issue:GEO-<n>`, and doesn't hold the merge.
With no `z-qa` session, or no preview comment, skip this; `z-qa` checks after release.
