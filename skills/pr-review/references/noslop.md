# noslop

noslop reviews every repo `hq noslop` lists (`z-stu` keeps the list). Run it with `hq review`, judge
each answer, and merge once `hq review gate` passes. Never also run Codex on these repos.

Contents: [Findings](#findings) · [The answers](#the-answers) ·
[Unfixed findings](#unfixed-findings) · [Each review](#each-review) ·
[The gate and overrides](#the-gate-and-overrides) · [When noslop fails](#when-noslop-fails)

## Findings

noslop posts each finding as a review comment by `noslop-review[bot]` holding `<!-- noslop:finding`
and a 16-hex id, or as an issue comment when it has no diff line. Several of one class share a
grouped comment: a reply whose first line is a bare disposition answers them all; one
`<id> <disposition>` line each answers them apart, and a finding with no line stays open. The
`### noslop` summary comment holds every finding's state, which the gate reads.

## The answers

The first line of a reply in the finding's thread is the disposition, nothing else; any explanation
goes on later lines. An issue-comment finding is answered by a new issue comment starting with its
id. A reply that quotes `<!-- noslop:` is skipped as noslop's own.

- **`fixed <sha>`** (agent): counts once the next `hq review`'s fix call confirms it at the head. A
  finding reported again stays open.
- **`not-a-defect <reason>`** (agent): noslop and the gate accept any reason, so judge it yourself
  by `fix-it-here`.
- **`deferred GEO-<n>`** (you): after filing the follow-up. noslop refuses it on a line the PR added
  or changed.
- **`accepted-risk <reason>`:** only with the owner's recorded answer, below.

## Unfixed findings

The agent's final reply lists what it left unfixed. For each: check the reason against
`fix-it-here`; file it and reply `deferred GEO-<n>` if it holds, or send it back if not. Send back
every finding left unanswered too.

`accepted-risk` needs the owner. Message the finding to `z-triage` as a decision with your
recommendation, and hold the merge. Once he answers, ask `z-stu` to record
`hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`; the gate counts it
open until then. `skills/pr-review/references/noslop.private.md` in hq-private (`hq defs` shows
where) says which answers count and how to cite them.

## Each review

Run `hq review <repo> <pr>` after each new FINAL. It reviews only what changed since the last review
and runs a fix call per `fixed` answer. No round limit. When the agent has answered everything
without a new commit, run `hq review <repo> <pr> --fixes-only` (no FINAL comes for an unchanged
head).

`hq noslop` shows each repo's emergency cap, off by default. Past it, `hq review` runs only fix
calls, and the gate passes once every finding is answered and confirmed. A push past the cap with no
`fixed` answer leaves noslop's last review on the old head, so the gate holds until the owner
overrides or `z-stu` lifts the cap. A PR that hits the cap means the reviewer keeps finding new
things: tell `z-stu`.

## The gate and overrides

`hq review gate <repo> <pr>` passes on green CI with no open finding, or with the owner's override
at that head. A finding is closed by a confirmed fix, `not-a-defect`, `deferred GEO-<n>`, or his
recorded `accepted-risk`. If the head moves while the gate runs, review the new head and run it
again.

When he says to merge anyway, in an answer that counts, ask `z-stu` to record
`hq pr override <repo> <pr> --source <source> --note '<why>'`. It passes every open finding at that
head, never red CI, and a push voids it. A session's approval or your own judgement is no override.

## When noslop fails

Hold the merge and message `z-stu` the error; it can switch noslop off for the repo. Never run Codex
in its place.
