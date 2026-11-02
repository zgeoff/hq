# Holds

Three holds in this file stop a merge: the skill proof and the owner's lgtm, which `hq review gate`
enforces, and a preview check, which you enforce. Each record hq keeps for the lgtm, such as his
answer or an exemption, is tied to one head commit, and a push voids it. Never pass an lgtm on by
message.

## The skill proof

A PR that changes a skill's `SKILL.md`, or a file under its `references/`, needs three headings in
its description, each with text under it:

- `## Skill checks`: the output of `bun x @zgeoff/chex prose links skill`.
- `## Cold read`: each finding from the cold-read skill, and how the agent answered it.
- `## Deslop`: what the deslop skill changed, or "none".

The gate checks the proof before the owner's lgtm, so he never approves a description that still has
to change. Check it like this:

1. Once the review findings are answered, run `hq review gate <repo> <pr>`.
2. If it blocks on the proof, its reason names the missing headings. Message the agent that reason
   word for word.
3. Read the sections the gate passed. It checks only that each has text. Send back failing chex
   output, and any cold-read finding with no answer.
4. Only then run `hq unblock add`, which puts the PR on the owner's list.

An edit to the description doesn't move the head. The agent needs no new review round. A push
doesn't void the proof either: the gate reads the description as it stands. When a push changes the
skill's text again, ask the agent to update the proof.

The gate skips the proof for a bot's PR. It also skips it for a PR with a `hq pr mechanical` or
`hq pr exempt` record at its head, in every repo, zgeoff/hq and zgeoff/hq-private included.

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
