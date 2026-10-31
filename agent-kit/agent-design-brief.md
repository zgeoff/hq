# Agent design brief

The launch prompt for an agent design pass: a Design issue without the `with-geoff` label. The
owner does not join; the agent decides from evidence by `agent-kit/playbooks/design.md`. The prompt
speaks as the owner. `hq brief <issue> --kind design` fills it:

- {{issue_id}}: the issue.
- {{playbook}}: the pinned command that prints the design playbook.
- {{record_line}}: the record line from `skills/delivery-lead/references/design-brief.private.md`
  in hq-private, with the issue in place of `<GEO-n>`.
- {{check_sketches}}: the pinned command that fetches `skills/linear-triage/scripts/check-sketches.sh`.
- {{permissions}}: a line for each of the issue's actions beyond the design pass, from the
  permission table, or nothing.

```text
/goal A decision record for {{issue_id}} as a Linear document linked from the issue, its follow-ups filed and checked, and the messages below sent. First read {{issue_id}} with your own Linear access, then the design playbook:
{{playbook}}

This is an agent design pass: I don't join it. Make each decision yourself from evidence, as the playbook's "Without it" step says. Decisions the issue marks as agreed are fixed inputs: build on them and don't reopen them. When a question needs me, write it on the issue with your recommendation, add the `Needs Geoff` label, and settle everything else.

Permissions:
You should read the checkout you run in, its docs and history, and run throwaway scripts in a git-ignored scratch folder. {{record_line}} You may comment on {{issue_id}}, and run `codex exec` for the playbook's second-opinion reviews. Commit nothing, push nothing, and open no PR: the record lives in Linear only.{{permissions}}

Write each follow-up as the tickets skill says: carry the record's decisions word for word, every code block included, and give each piece you settled its own Design block and Acceptance. Keep my name out of the record and issues; say "the owner". Invent examples, never from my messages, memories or people I know.

Before your final report, check the follow-ups:
1. Read the record with the Linear document tool, and each follow-up with the issue tool. Write each Markdown body, unchanged, to a file in your scratch folder.
2. Fetch the checker into your scratch folder: {{check_sketches}}
3. For each follow-up, and each decision it covers, run `bash <scratch>/check-sketches.sh --decision <decision number> <record file> <issue file>`. The decision number is the one in the record's heading for it, such as "Decision 7".
4. Copy each code block the script marks `"found": false` into that issue's description, and run it again.

Finish line: when every follow-up passes, send z-stu and z-delivery one message each through your ATC message tool, with the record's link and the follow-ups' IDs, then a final report with the same links. Send an ATC `decision` note when you need a call, and a `blocked` note with the exact text when an action is refused. When done, remove your scratch folder.
```
