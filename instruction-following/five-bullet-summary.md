# Five Bullet Summary

## Prompt

```text
Summarize the text below in exactly 5 bullets. Each bullet must be under 12 words. Do not use adjectives.

The company delayed the analytics dashboard launch after discovering that historical account data did not consistently match the new reporting format. The existing dashboard will remain available while the data team validates account histories, updates export samples, and prepares revised documentation for customer-facing teams.
```

## What This Tests

- Strict instruction following.
- Counting bullets and words.
- Avoidance of adjectives.
- Concise summarization.

## Strong Answer Signals

- Produces exactly five bullets.
- Keeps every bullet under twelve words.
- Avoids adjectives.
- Captures delay, reason, current dashboard, validation, and documentation/export work.

## Weak Answer Signals

- Uses four or six bullets.
- Includes adjectives like `new`, `existing`, or `revised`.
- Exceeds the word limit.
- Drops the main reason for the delay.

## Scoring Rubric

- `5`: Meets all formatting constraints and preserves the core facts.
- `4`: One minor content issue, no format violations.
- `3`: Useful summary with one format violation.
- `2`: Multiple format violations or missing key facts.
- `1`: Ignores the requested structure.

## Scoring Dimensions

- `format-compliance` (weight 3): Exactly five bullets, each under twelve words, with no adjectives.
- `content-fidelity` (weight 2): Preserves the delay, reason, current dashboard, validation, and documentation/export facts.

## Variants

- Easier: Remove the adjective ban.
- Harder: Require each bullet to start with a verb.
- Different angle: Ask the model to self-check the constraints after answering.

## Notes

This prompt is intentionally fussy. It reveals whether a model can satisfy mechanical constraints.
