---
description: Write a short log of this session to docs/ai-log/NN-<topic>.md
---

Write a session log for this conversation to `docs/ai-log/NN-<topic>.md`.

- `NN` is the next two-digit number after the highest existing file in `docs/ai-log/` (`01` if the folder is empty or missing). Create the folder if needed.
- `<topic>` is a short kebab-case name for what the session was about.
- Maximum ~20 lines. Plain, factual tone. No filler, no self-praise.
- Write in English.
- Write in the first person as the developer: "I" is the user. Refer to the assistant as "Claude", never as "the assistant" or "the AI".

Use exactly these sections:

## Goal
What the session was about, in one or two lines.

## Decisions
What I decided, one line each, linking to the matching entry in `docs/decisions.md` (for example `[ADR-03](../decisions.md#adr-03-status-codes-by-semantics)`). Only list decisions I confirmed.

## Where I changed course
Proposals or claims from Claude that I rejected, modified or corrected, and my reasoning. Be precise and do not soften it: state what Claude proposed or claimed, what I decided or what is actually true instead, and why, using the reasoning I gave in the conversation. Do not invent reasoning I did not give. Do not list routine file path or commit message preferences.

## Revised my own positions
Positions I held at first and later changed, with what I changed to and why. Use my own stated reasons only. Omit this section if there are none.

## Open questions
Anything left unresolved, written in the first person. Write "None" if there is nothing.

Base the log only on what happened in this conversation.