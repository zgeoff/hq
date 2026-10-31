# Investigation

Answer the ticket's questions with evidence. Change no code: whoever assigned the ticket wants
answers to decide on, and a change would decide for them. You may run anything, and write only:

- a throwaway script in your scratch folder;
- the answers, where step 7 says.

1. Write the ticket's questions at the top of your answers, one at a time. When the ticket asks none
   outright, write the questions it implies. Above each answer, write the decision it informs, so
   the answer stays on what the reader needs. When the ticket names none, write your best reading of
   it.
2. For a question about how something works, use the `how` skill. For a question about why it's
   built that way, use the `why` skill. Keep the sources each skill cites, and tag each sentence as
   step 3 says.
3. Answer from evidence: code, a command and its output, a log line, a past PR or issue. End each
   sentence that states a fact with one tag:
   - [measured]: you ran it and saw the result;
   - [read in the code]: you read it in the code;
   - [from a record]: a log, PR, issue or doc that already existed says so;
   - [guess]: none of these. Use it only after a run and a search found nothing, and say what would
     settle it.
4. When a question is about behaviour, such as speed, output, layout or whether something works,
   find out with a run. Use `bun verify` when it drives that behaviour. Otherwise write a throwaway
   script.
5. When a question asks you to choose between options, recommend one. Give a table of the options,
   with what each costs in effort and risk. Then say what would change your pick.
6. When the evidence shows the question itself is wrong, say so, with the evidence. Then answer the
   question it should have asked.
7. When the ticket names no place for the answers, write them in a comment on the ticket. When it
   names a file, open a PR that holds only that file. At the end of the answers, list each piece of
   work they call for under "Follow-ups". Whoever assigned the ticket decides which to file, so file
   none yourself.
