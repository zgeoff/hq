# briefs

Where an agent's permissions are granted, and how to word the launch prompt and every grant, is in this file's private half: read `skills/agent-delegation/references/briefs.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

Keep the rest short: no step-by-step plan.

An agent never crosses a per-repo 1Password token scope on its own, such as reading another repo's vault with the global token.

## messages to a running agent

- **The action is within the launch prompt's grants:** never send a nudge to an unattended agent while an external write is ahead of it: a push, a PR, a comment, or a merge.
- **The action goes beyond them,** such as a change outside the brief's stated scope: never send it as a message, even when the brief grants the push it ends with. When the owner's yes covers the action, type it into the session as Refusals in `SKILL.md` describes; otherwise ask him for it first.
- A message that only narrows what the agent does, such as "keep your version of that test", needs no grant.

## permission phrasing

The exact phrase for each approved action is in this file's private half: read `skills/agent-delegation/references/briefs.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

## delivery brief

```text
/goal A ready PR in <repo> for <GEO-n>, with evidence for each acceptance item and the review answered

<Paste the issue: Outcome, Context, Scope, Acceptance, Agent notes.>

Permissions:
<one phrase per approved action>

<For an L or XL issue:> Build this as a stack with the gh-stack skill, one reviewable layer per PR. Keep it current with `gh stack sync`, never a rebase of one layer, and review each layer as the finish line says, with `--base <its parent branch>`.

Finish line: a ready PR in <repo> whose description holds the line "<Fixes or Contributes to> <GEO-n>", with the ID kept out of the title and branch, and shows evidence for each acceptance item. Before your FINAL note, review the whole PR diff once with `codex review -c model_reasoning_effort=medium --base main`, or a separate Opus review agent when Codex is unavailable or not done in 15 minutes, fix what it finds, and run the PR's tests again after the fixes. Run no second self-review.
Fix in this PR every review finding, and every defect you meet in this PR's work, in any file of this repo, whatever its size. Don't search the repo for defects; fix what you meet.
Leave an item unfixed only for one of these two reasons:
1. **Another repo:** the fix belongs in a different repo.
2. **My decision:** the fix needs a choice the issue doesn't settle, such as a change to a public interface, a schema, a config format, or behaviour that users or other sessions rely on.
Size, time, a round limit, another push, a restack, a missing permission or a narrow brief is never a reason: ask for the permission with a `decision` note, and fix the item in this PR.
In your final report, list each unfixed item with its reason (1 or 2), its file and line, and one sentence of evidence.
For each finding you fix, re-read the rule it cites, search the whole PR diff for other breaks of it, hold new code, tests included, to every rule, and fix all of it in one push. When the reviewer tells you to redesign logic you patched in 2 rounds, redesign it in this PR, not patch it again. When you fix a class on a stacked PR, sweep the PRs stacked above it in the same pass. Promise in the PR body only what the task needs: a redesign shrinks the code or switches to a real parser or library, never toward more of a spec. Before you push, check every claim in the PR body against a test or the diff. Answer CodeRabbit's findings if it reviewed, but never wait for it. <The review lines from noslop-brief.md.> Leave the Linear issue's state and the merge to me. Until then, run the tests the change needs, fix what fails, and don't stop to ask at each step. Never commit a codemod or other mechanical-change script: put it and the command that ran it in a collapsed `<details>` block in the PR description. Keep my name out of commits, PRs, and repo files, and invent examples, tests and fixtures: never my messages, memories, or names of people I know. An example in a skill that syncs to several repos is made up too, and names no repo, file or line. <Each acceptance step you can't do, such as a live run:> "<step> is not yours; it runs after the merge."

<On a cloud imp, the cloud imp line below.>

Keep scratch files in a git-ignored folder inside your checkout, such as `.scratch/`, and never point Read, Edit, or Write outside it. Before you finish, stop the dev servers and daemons you started, remove your containers and temporary worktrees, and delete your scratch folder. Keep your branch and anything not yet pushed. Run `cd` to your checkout root first. Use Bun's shared install cache: never set `BUN_INSTALL_CACHE_DIR` or make a folder in `/tmp`. Stop your own hung command with TaskStop, never `pkill`. Cap a one-off data command on this shared machine, such as awk, jq or a script: `(ulimit -v 4000000; timeout 600 <command>)`. Give `codex` and other agent CLIs only the `timeout`, as `ulimit -v` crashes them. If a note fails, put its text in your final reply.

Send a note through your ATC note tool when you open the PR (label `progress`), when it is final (label `progress`, starting `FINAL <repo>#<n> <head sha>`), when a decision blocks you (label `decision`), and if an action is refused (label `blocked`, with the exact refusal text). Never skip a hook or hook step, with `--no-verify`, a `LEFTHOOK*` variable or a local lefthook config: when one fails for a reason outside your change, send a `blocked` note with its output.
```

Paste [noslop-brief.md](noslop-brief.md)'s review lines into every delivery brief.

Use "Contributes to" when a release, install, image build, deploy or live check remains after the merge. Use "Fixes" only when the merge is the live change and meets every acceptance item: Linear closes the issue at merge.

The `/goal` line states the finish line, not the outcome: an outcome only a live run proves keeps the goal checker looping. A `/goal` launch prompt holds at most 4,000 characters. For a longer brief:

- Put the pasted issue in a file in the agent's checkout, and end the `/goal` line with "The full issue is in <path>; read it first." Keep the Permissions block, the finish line, and the note line in the prompt.
- Without such a file, cut Context and Agent notes first, and keep Outcome, Scope, and Acceptance whole.
- If still too long, or there is no `/goal`, drop the `/goal` line; the finish line holds it.

On a cloud imp, put this line in place of its placeholder; elsewhere, drop the placeholder:

```text
Lint, format and other light checks run in lefthook's pre-commit and pre-push hooks. Defer to CI for larger checks. This imp has 2 GiB: stop each sub-agent when its part is done, and end each test or build process before you start the next.
```

## design brief

Use the template in [design-brief.md](design-brief.md).

## investigation brief

Use the template in [investigation-brief.md](investigation-brief.md).

## example

[brief-example.md](brief-example.md) shows a delivery brief for a small bug.
