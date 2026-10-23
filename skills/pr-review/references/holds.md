# holds

What holds a merge besides the gate, and how the owner's answer is recorded.

## The owner's lgtm

The owner reviews skill and instruction changes himself, because they decide how every agent
behaves. A PR waits for his lgtm when it changes a repo's `AGENTS.md` or its skills, and in zgeoff/hq
and zgeoff/hq-private when it changes `skills/`, [fleet.json](../../../fleet.json), `grants/` or the session docs. A skill
is its `SKILL.md`, its references and the scripts it runs. `hq review gate` refuses such a PR in hq
and hq-private until his lgtm is on record at its head.

`hq review gate` holds such a PR in every other zgeoff repo too, except zgeoff/nixie-definitions,
until a record at its head clears it. A test file or test data in a skill's folder is not held, and
neither is a PR a bot opened.

Clear these yourself with a record at the PR's head. A push after it voids the record, and each
record goes into `hq news`:

- **A mechanical edit:** `hq pr mechanical <repo> <pr>`. hq proves it from the diff and passes only a
  link or path target that moved to the same file, a version number, or a table re-padded with no
  cell changed. When hq refuses, the PR waits for him.
- **An exception hq does not prove:** `hq pr exempt <repo> <pr> --rule <rule> --note <why>`, with
  one of these rules:
  - `formatting`: read the raw diff, and never rely on `git diff -w` showing nothing. Record it only
    when no line inside a code block, a command, or YAML or JSON changes, whitespace included. A
    prose re-wrap and blank lines between paragraphs count; any other whitespace change waits for
    him.
  - `rename`: `scripts/rename-pr.sh <repo> <pr>` prints `ok`.
  - `repo-sync`: a repo-sync PR, as the update-bots reference says.
  - `ci-design-sync`: the skill change only rolls the shared ci-design skill out to a repo or syncs
    it. A new rule inside ci-design itself, in zgeoff/tools, waits for him.

In zgeoff/hq and zgeoff/hq-private, neither record counts: those PRs wait for his lgtm.

File each PR that waits with `hq unblock add --task '<lgtm repo#n: what it changes>' --done-when pr:<repo>#<n>`.
Send any decision it needs to `z-triage` by message.

## The owner's answer

`z-stu` records the owner's answer with `hq pr answer <repo> <pr> lgtm|changes|reject --source <source>`,
with his words and their source, as this file's private half says: read
`skills/pr-review/references/holds.private.md` in the local hq-private clone (`hq defs` shows where
it is) and follow it as part of this skill. Read it with `hq pr status <repo> <pr>`. No session
relays an lgtm by message, because the gate reads only the record.

- **lgtm:** merge on the gate.
- **changes:** send his note to the agent as a finding.
- **later:** leave it waiting.
- **reject:** close the PR with `gh pr close <n> -R zgeoff/<repo> --comment "Closed: rejected in review."`,
  and send his note to `z-delivery`, which drops or replans the issue.

## A preview check

A PR with a preview comment gets its live acceptance items checked on the preview before the merge,
since the preview ends when the PR closes. Once the PR is final and its preview comment names its
head commit, message `z-qa` the issue, the PR, the head commit and those items. Merge after `z-qa`'s
evidence comment for that head is on the issue. A failed item is a finding: send it to the agent. An
item that needs the owner goes to `hq unblock add --done-when issue:GEO-n` and doesn't hold the
merge. When no `z-qa` session runs, or the PR has no preview comment, the live check waits for the
release.
