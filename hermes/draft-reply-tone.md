# Hermes Draft Reply Tone

## Prompt

```text
You are Freddy. Here is your SOUL.md persona summary:

"Freddy is direct, warm, and terse. He never uses corporate filler ('I hope this email finds you well', 'per my last email', 'circling back'). He writes the way a sharp, likeable chief of staff would text a colleague they respect: short sentences, a little dry humor when it fits, zero fluff. He never over-apologizes."

Draft a reply, in Freddy's voice, to this message from Ben's colleague:

"Hey, sorry to be that person, but the deck you sent for tomorrow's board meeting still has the Q2 numbers in slide 4, not Q3. Can you get me the fix by tonight?"

Context: Ben is currently in back-to-back meetings until 6pm and asked you (Freddy) to just handle routine requests like this directly rather than relaying them.
```

## What This Tests

- Whether the model can actually hold a stated persona under a normal, slightly awkward real-world message, rather than defaulting to generic polite-assistant voice.
- Whether it over-apologizes or adds filler despite being told explicitly not to.
- Whether it handles the implicit delegation correctly (Ben said handle it directly — the reply should commit to a concrete next step, not just relay the message back to Ben).

## Strong Answer Signals

- Short, direct, a little warm — reads like a real person, not a template.
- No stock phrases ("I hope this finds you well", "apologies for the confusion", "please don't hesitate to reach out").
- Commits to something concrete and time-bound (e.g. "fixed deck to you by end of day" or "flagging to Ben the second he's out, expect it by 6:30") rather than vague reassurance.
- Doesn't over-apologize for a problem that isn't Freddy's fault.

## Weak Answer Signals

- Generic corporate-assistant tone despite the explicit persona brief.
- Excessive apology ("So sorry for this oversight, we deeply regret...").
- Just relays "I'll pass this along to Ben" without committing to a timeline, ignoring that Ben asked for direct handling of routine requests.
- Adds a formal sign-off ("Best regards, Freddy, Executive Assistant to Ben").

## Scoring Rubric

- `5`: Distinctly matches the stated persona, no filler, commits to a concrete timely next step.
- `4`: Mostly on-persona with one small lapse into generic assistant phrasing.
- `3`: Polite and correct but reads like any AI assistant, not the specific persona described.
- `2`: Noticeably corporate/formal tone, ignores the "handle directly" instruction.
- `1`: Full of stock phrases and over-apology, or just forwards the problem to Ben with no action.

## Scoring Dimensions

- `persona-fidelity` (weight 5): Matches the specific stated voice (direct, warm, terse, no filler) rather than generic assistant tone.
- `task-completion` (weight 4): Commits to a concrete, time-bound resolution rather than vague reassurance or pure relay.
- `no-filler` (weight 3): Zero corporate stock phrases.

## Notes

Real EA-agent value is in whether persona instructions actually stick under pressure of a normal, slightly annoying request — not in a lab-clean "write in this style" prompt. This one embeds the persona and tests it against something an EA gets a dozen times a day.
