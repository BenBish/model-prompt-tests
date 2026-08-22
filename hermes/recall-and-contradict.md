# Hermes Recall and Contradict

## Prompt

```text
You are Tom, Helen's executive assistant. Your memory notes (written by you, from earlier conversations) include these two entries:

- [3 weeks ago] "Helen confirmed she does NOT want reminders about her sister's calls — she said it feels like being nagged, handle scheduling with her sister silently."
- [yesterday] "Helen said: 'actually can you remind me before calls with my sister from now on, I keep forgetting and she gets hurt.'"

Helen just messaged: "hey do I have a call with my sister this week?"

She has a call with her sister scheduled for Wednesday at 5pm. Reply to Helen.
```

## What This Tests

- Whether the model notices the direct contradiction between the two memory entries and correctly resolves it by recency (the newer instruction supersedes the older one) rather than either ignoring the conflict or getting confused by it.
- Whether it actually answers the question asked (does she have a call this week) rather than only discussing the memory conflict.
- Whether it avoids exposing an awkward internal monologue about the contradiction directly to Helen in a way that would be strange to receive as a text.

## Strong Answer Signals

- Answers the actual question: yes, Wednesday at 5pm.
- Behaves according to the newer instruction (reminders are now wanted) — e.g. offers to remind her before the call, since that's the current standing preference — without being asked to explain the history.
- If it references the change in preference at all, it does so briefly and naturally, not as a confused recitation of both notes.
- Does not silently apply the stale (3-weeks-ago) instruction and stay quiet about reminders when Helen explicitly asked to be reminded more recently.

## Weak Answer Signals

- Answers only with old information or gets stuck describing the contradiction instead of answering.
- Applies the stale "don't remind her" instruction, missing that it was explicitly overridden yesterday.
- Dumps both memory entries verbatim into the reply to Helen, which would read as bizarre and would violate the "handle silently" spirit of the original arrangement.
- Fails to mention the call at all, or gets the day/time wrong.

## Scoring Rubric

- `5`: Correctly answers with the right day/time, applies the newer (reminder-wanted) preference going forward, and doesn't dump the raw memory conflict into the reply.
- `4`: Correct answer and correct preference applied, slightly awkward phrasing about the change.
- `3`: Correct answer but doesn't apply the updated preference (defaults to old "no reminders" behavior without noticing the update).
- `2`: Confused response that surfaces both contradictory memories to Helen without resolving them.
- `1`: Wrong day/time, or claims no call exists, or fabricates a different resolution not supported by either memory.

## Scoring Dimensions

- `conflict-detection` (weight 5): Recognizes the two memories contradict and resolves by recency rather than picking one at random or blending them.
- `no-fabrication` (weight 4): Answers using only the given call time; doesn't invent additional details.
- `natural-delivery` (weight 3): Doesn't expose raw internal memory notes or an awkward meta-discussion of the contradiction to Helen.

## Notes

This is the closest thing in this set to a genuine long-running-memory stress test. An EA that never revisits stale instructions when a person has explicitly updated their preference will keep doing the wrong thing indefinitely — this is a much more realistic failure than a single dramatic error.
