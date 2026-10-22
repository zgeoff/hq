# follow-ups

You are the only session that files an issue from a PR. Filing sits here, at the moment a finding is
answered, because that is where the reason is still checkable against the diff. Load this file
before every Linear `save_issue` call: the skill gate refuses the call until you have.

## The reason test

An item a PR leaves unfixed holds one of two reasons, and nothing else:

1. **Another repo:** the file the fix changes is in a different repo from the PR. Check the path
   the agent names against the PR's repo.
2. **A choice the issue doesn't settle:** the agent names the choice, such as a change to a public
   interface, a schema, a config format, or behaviour that users or other sessions rely on.

Size, time, a round limit, another push, a restack, a narrow brief and a missing permission are not
reasons. A doc change that only records behaviour the issue or a linked decision already settles is
not one either: it belongs in this PR. Send each item that fails back to the agent to fix in this
PR, in 1 to 3 plain sentences with its file and line, and keep its finding open.

## Filing

For each item that holds:

1. File it in Triage in team GEO. Its description's first line is `From <repo>#<n>`, then the
   agent's text: Outcome, Context with the file, line and evidence, Scope and Acceptance. Use the
   agent's words, because the agent saw the code and you only checked the reason.
2. Record it: `hq followup add GEO-<n> --from <repo>#<n>`. The daily check counts any issue that
   points at a PR without this record as a bad filing.
3. Reply in the finding's thread: `deferred GEO-<n>`, with
   `gh api repos/zgeoff/<repo>/pulls/<n>/comments/<comment id>/replies -f body='deferred GEO-<n>'`.
4. For reason 2, message `z-triage` the choice, so its check puts it to the owner.
