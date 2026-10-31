# Going through PRs with the owner

A PR walk is a helper session that goes through a batch of PRs with the owner, to find out why their
reviews took rework (each round is one noslop review of a new head). It keeps the walk out of your
chat with him, and reports back to you.

Never edit this file to add a fault the helper found: file it as an issue.

## Steps

1. Agree the batch with him, such as PRs that took more than 2 rounds, or with `accepted-risk`
   answers. No start given: 30 days ago.
2. Run `hq noslop report --since <start, ISO 8601 UTC> --json`, read each PR's last noslop summary
   with `gh pr view <n> -R zgeoff/<repo> --comments`, and write the PR list to a file in your
   scratchpad: repo and number, rounds, findings, and a one-line guess at the cause. The brief
   takes the file's path, never the list, so it stays under the launch limit.
3. Take the record line and the agreed-change form from
   `skills/intake/references/pr-walk.private.md` in hq-private (`hq defs` shows where).
4. Fill the brief in [agent-kit/pr-walk-brief.md](../../../agent-kit/pr-walk-brief.md): the PR list's path, earlier walk logs, both private
   texts and your session id. The helper fills only `<n>` and `<repo>`.
5. Launch it in the hq-defs checkout as [agent-kit/helpers.md](../../../agent-kit/helpers.md) says, and wait for its message.
6. File each item he wants in GEO Triage. Then file one more Triage issue updating this file's fault
   list: new faults, and faults a new rule now covers, named by what the rule says.
7. Tell him the issue IDs in one line.
