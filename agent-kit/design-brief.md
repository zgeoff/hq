# Design brief

The launch prompt for a design session with the owner: an issue labelled `with-geoff`, of type
Design or with `needs-design`. Without `with-geoff`, the session runs without him from
`agent-kit/playbooks/design.md`. The prompt speaks as the owner.

- Paste the record line from `skills/delivery-lead/references/design-brief.private.md` in
  hq-private (`hq defs status` shows where) word for word, and follow the rest of that file.
- Paste the issue's Outcome, Context, Questions to settle and Acceptance as written.
- When the design changes how Nix behaves or what she remembers, keep the Nix sentence; otherwise
  drop it.

```text
Run a design session with me for <issue ID>: <outcome from the issue>.

<The issue's Outcome, Context, Questions to settle and Acceptance sections.>

I'll join this session to work through the design with you. Lead it: open with your read of the problem and a recommended direction. Then work through the questions with me one at a time, and propose an answer for each. I make the calls. Give one decision per message: your proposal in a few lines, the call you need from me, and nothing else. Keep the rest for the record.<When the design changes Nix: For each decision, add a short prompt I can paste to Nix without changes.>

Don't write the record into a repo. <The record line from design-brief.private.md.>

Before your final report, check the follow-up issues you filed, then send two messages:
1. Read the record with the Linear document tool, and each follow-up issue with the issue tool. Write each Markdown body, unchanged, to a file in your scratch folder.
2. For each follow-up, and each decision it covers, run `skills/linear-triage/scripts/check-sketches.sh --decision <decision number> <record file> <issue file>`, with the hq-defs clone, at <the path `hq defs status` prints>, as the working folder. The decision number is the one in the record's heading for it, such as "Decision 7".
3. Copy each code block the script marks `"found": false` into that issue's description.
4. When every follow-up passes, send `z-stu` and `z-delivery` one message each through your ATC message tool, with the record's link and the follow-ups' IDs.

Finish line: those messages, and a final report with the same links.
```
