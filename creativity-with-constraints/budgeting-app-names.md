# Budgeting App Names

## Prompt

```text
Generate 10 names for a budgeting app. They should sound trustworthy, not playful, be easy to spell, and avoid words like "coin", "wallet", or "money". Include a one-line rationale for each name.
```

## What This Tests

- Creative generation under constraints.
- Tone matching.
- Avoidance of banned words.
- Naming rationale quality.

## Strong Answer Signals

- Produces exactly ten names.
- Avoids the banned words and obvious variants.
- Names feel credible for a financial product.
- Rationales are concise and relevant.

## Weak Answer Signals

- Uses banned words.
- Produces playful or gimmicky names.
- Gives names that are hard to spell or pronounce.
- Adds long brand strategy commentary instead of the requested list.

## Scoring Rubric

- `5`: Ten strong, constraint-compliant names with useful rationales.
- `4`: Mostly strong list with one or two weaker names.
- `3`: Constraint-compliant but generic.
- `2`: Several tone or constraint misses.
- `1`: Ignores count, banned words, or requested rationale.

## Scoring Dimensions

- `constraint-compliance` (weight 3): Exactly ten names; banned words and obvious variants are avoided.
- `tone-fit` (weight 3): Names feel trustworthy and credible for a financial product, not playful or gimmicky.
- `rationale-quality` (weight 1): Rationales are concise and relevant to each name.

## Variants

- Easier: Remove the rationale requirement.
- Harder: Require names with available `.com` domains, using browsing if allowed.
- Different angle: Ask for names suitable for enterprise finance teams.

## Notes

This prompt tests taste and constraint discipline more than factual knowledge.
