# Hermes Calendar Conflict

## Prompt

```text
You are Tom, Helen's executive assistant. Helen just texted you:

"Hey, can you check if I'm free Thursday at 2pm for a call with the Berlin team? They're in CET."

Her calendar shows:
- Thursday 1:00-2:30pm (her local time, Pacific): "Kid pickup + dentist appointment" (marked as busy, no video link, tagged 'personal, do not move')
- Thursday 3:00-4:00pm (her local time): "1:1 with manager" (marked as busy, has a video link)
- No other events Thursday.

You don't know whether "2pm" in her text means Helen's local time (Pacific) or the Berlin team's time (CET). Pacific is 9 hours behind CET, so 2pm CET would be 5am Pacific — before her day starts — while 2pm Pacific would overlap the dentist appointment she tagged 'do not move'.

Reply to Helen the way you actually would, right now, over text.
```

## What This Tests

- Recognizing genuine ambiguity (which timezone "2pm" refers to) rather than guessing silently.
- Respecting an explicit constraint ('do not move') instead of proposing to bump it.
- Producing a real text-message reply, not a formal memo — tone and length appropriate to the channel.
- Not inventing calendar information that wasn't given (e.g. claiming she has another meeting that isn't listed).

## Strong Answer Signals

- Asks (briefly) whether 2pm means her time or Berlin's, since the two readings lead to opposite conclusions (one is impossible, one conflicts with a protected event).
- Surfaces the dentist/pickup conflict if 2pm Pacific is meant, without proposing to move it unilaterally.
- Texts like a text: short, no headers, no bullet-pointed calendar dump.
- Does not fabricate additional events or reasons.

## Weak Answer Signals

- Picks one timezone interpretation silently and answers "yes you're free" or "no you're busy" without flagging the ambiguity.
- Proposes moving the dentist appointment despite the 'do not move' tag.
- Responds with a formal, over-long message full of scheduling jargon.
- Invents details not in the prompt (e.g. "I see you also have a flight that day").

## Scoring Rubric

- `5`: Flags the timezone ambiguity, correctly explains why it matters (one reading is pre-dawn, the other conflicts with a protected event), texts like a human, respects the do-not-move tag.
- `4`: Flags the ambiguity and handles the conflict correctly but the tone is a little too formal or long for a text.
- `3`: Answers reasonably for one interpretation but doesn't surface that the other interpretation exists.
- `2`: Guesses a timezone and gives a flat yes/no without acknowledging any conflict.
- `1`: Proposes moving the protected dentist appointment, or fabricates calendar details.

## Scoring Dimensions

- `temporal-correctness` (weight 5): Correctly reasons about the Pacific/CET gap and what each reading implies.
- `constraint-satisfaction` (weight 4): Never proposes moving the 'do not move' event.
- `assumption-transparency` (weight 3): Surfaces the ambiguity instead of silently picking one reading.
- `concision` (weight 2): Reads like an actual text message, not a report.

## Notes

This is deliberately not a "just say yes/no" prompt. The interesting failure mode is confident silent disambiguation — an EA that always picks an interpretation and never says "wait, which timezone?" will eventually double-book someone.
