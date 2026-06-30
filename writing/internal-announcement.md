# Internal Announcement Rewrite

## Prompt

```text
Rewrite this rough internal announcement so it is clear, direct, and calm. Keep it under 180 words and preserve the facts.

Hey everyone - so the dashboard migration is taking longer than we thought. We found some issues with historical account data not matching the new reporting format and we don't want to ship something confusing or wrong. The current dashboard will stay live this week. We are moving the launch to next Tuesday. If your team has customer calls before then, keep using the current dashboard and do not promise the new export format yet. We'll share a sample export by Friday.
```

## What This Tests

- Tone control.
- Fact preservation.
- Concision under a word limit.
- Ability to improve clarity without corporate filler.

## Strong Answer Signals

- Keeps all dates, actions, and cautions intact.
- Sounds calm and direct.
- Stays under 180 words.
- Makes the operational guidance easy to scan.

## Weak Answer Signals

- Drops important facts like the Friday sample export.
- Adds unsupported apologies, blame, or promises.
- Exceeds the word limit.
- Makes the announcement vague or overly polished.

## Scoring Rubric

- `5`: Clear, concise, calm rewrite that preserves every fact.
- `4`: Strong rewrite with minor wording or structure issues.
- `3`: Understandable but loses some directness or polish.
- `2`: Drops facts, changes meaning, or misses the tone.
- `1`: Fails the rewrite or ignores the constraints.

## Variants

- Easier: Remove the word limit.
- Harder: Produce versions for executives, support, and sales.
- Different angle: Ask for a Slack version and an email version.

## Notes

This prompt is useful for testing whether a model respects facts while improving style.
