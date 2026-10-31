# Design

Settle the design questions the ticket lists, and write the decisions down so the agent that later
builds it needs no design of its own. When the ticket has the `with-geoff` label, Geoff joins this
session and makes each decision. Otherwise you make the decisions yourself, and put on the ticket
only the questions that need him, as step 3 says.

The `tickets` skill defines a ticket's Design block, its Acceptance section and the design triggers.

1. Learn the system. Read the repo's `docs/vision.md` when it exists, then the architecture docs,
   then the code and the history the questions touch. Use the `how` skill for how the system works,
   and the `why` skill for why it's built that way. Quote each rule you rely on, from the repo's
   docs, skills or AGENTS.md, word for word, with its path. A rule from memory doesn't count.
2. Settle what you can by evidence. For a design that's costly to change and has more than one good
   answer, such as a public API or a schema, run the `bake-off` skill. For a question you can answer
   by running something, such as speed or output, run it, with the repo's `bun verify` script when
   it has one, or a throwaway script.
3. Decide each question, one at a time:
   - **With `with-geoff`:** send your first message: how the system works today, drawn with the
     `show-me` skill, the rules you quoted, the constraints you found, and anything in the ticket
     you think is wrong. Wait for his reply. Then bring each question in its own message, written
     with the `show-me` skill: the options drawn on the system as it is now, your recommendation and
     its cost, and the one decision you need. End your turn after each. When he questions the
     premise, research it again as in step 1, and bring the question back.
   - **Without it:** pick the option your evidence supports, and record the options you rejected and
     why. For a decision that can't be undone, get a review of your pick from another model family
     through the `second-opinion` skill first. When a question needs Geoff, such as product
     direction or a cost only he can accept, write it on the ticket with your recommendation, add
     the `Needs Geoff` label, and settle the questions it doesn't block. When that question blocks
     all the others, skip to step 7, and send the ticket's link in place of a record.
4. Write the decision record as a Linear document linked from the ticket: the problem, the code that
   will call the new design, the chosen design, the options rejected and why, the trade-offs
   accepted ("we accept X in exchange for Y"), the open risks, and who made each decision.
5. When one PR can do the whole ticket, write its Design block and its Acceptance. Make each
   Acceptance check one that runs against the real system. When the work splits, file a follow-up
   ticket in the ticket's team for each piece that can land on its own. Start each description with
   `From design <record link>`, and give each one whose design you settled its own Design block and
   Acceptance, so it needs no design pass. File any other follow-up too, with no Design block:
   z-triage marks it `needs-design` when it meets the design triggers.
6. Check each Design block you wrote: that the quotes match, each path exists, and each Acceptance
   check fails today. Then get a review of the block through the `second-opinion` skill, and fix
   what it finds.
7. Through your ATC message tool, send z-stu and z-delivery one message each with the record link
   and the ticket IDs. Your final report carries the same links. Then the session is done.
