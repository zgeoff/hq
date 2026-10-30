# design brief

A design session works through a Design issue with the owner, then files its own record in Linear and tells `z-stu` and `z-delivery`, so a finished design never waits unseen. The brief's record line is in this file's private half: read `skills/agent-delegation/references/design-brief.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

```text
Run a design session with me for <GEO-n>: <outcome from the issue>.

<Paste the issue: Outcome, Context, Questions to settle, Acceptance.>

I'll join this session to work through the design with you. Lead it: open with your read of the problem and a recommended direction, then work through the questions with me one at a time, proposing an answer for each. I make the calls. Give one decision per message: your proposal in a few lines, the call you need from me, and nothing else. Keep the rest for the record.<When the design also needs Nix: For each decision, add a short prompt I can paste to Nix as it stands.>

Don't write the record into a repo. <The record line from this file's private half.> Before your final report, check each follow-up you filed against the decisions it covers: export the record and each follow-up's description to files, and run `skills/linear-triage/scripts/check-sketches.sh --decision <n> <record file> <issue file>` for each decision it covers. Copy every block that the script marks missing into its description. Then send `z-stu` and `z-delivery` one message each through your ATC message tool, with the document's link and the follow-ups' IDs. Finish line: those messages, and a final report with the same links.
```

When the design changes how Nix behaves or remembers, put the Nix line in place of its placeholder, after a space; otherwise drop the placeholder.

To export, read the record with the Linear document tool and the issue with the issue tool, and write each Markdown body to a file in the scratchpad as it stands.
