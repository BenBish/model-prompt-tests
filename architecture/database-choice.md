# Database Choice

## Prompt

```text
Compare Postgres, SQLite, and DynamoDB for a small SaaS app with 2 developers, low initial traffic, and uncertain future requirements. Recommend one. Include the main tradeoffs, migration risk, operational burden, and what would make you change the recommendation.
```

## What This Tests

- Architecture tradeoff judgment.
- Ability to recommend instead of listing pros and cons forever.
- Understanding of operational constraints for a small team.
- Awareness of future migration paths.

## Strong Answer Signals

- Recommends Postgres for most small SaaS cases unless constraints say otherwise.
- Explains SQLite as excellent for local/simple deployments but limited for multi-user hosted SaaS growth.
- Explains DynamoDB as powerful but higher modeling and operational complexity for uncertain requirements.
- Names conditions that would change the choice.

## Weak Answer Signals

- Treats all options as equally good.
- Recommends DynamoDB only because it scales.
- Ignores the two-developer constraint.
- Fails to discuss migration and operational burden.

## Scoring Rubric

- `5`: Clear recommendation with grounded tradeoffs and change conditions.
- `4`: Good recommendation with minor missing detail.
- `3`: Reasonable but generic comparison.
- `2`: Overweights hype or misses team/product constraints.
- `1`: No recommendation or technically misleading guidance.

## Scoring Dimensions

- `recommendation-clarity` (weight 3): Gives one clear recommendation rather than an endless pros/cons list.
- `constraint-fit` (weight 3): Grounds the choice in the two-developer, low-traffic, uncertain-future constraints.
- `change-conditions` (weight 2): Names concrete conditions that would change the recommendation.

## Variants

- Easier: Compare only Postgres and SQLite.
- Harder: Add offline-first mobile sync and enterprise audit requirements.
- Different angle: Ask for a decision memo with risks and mitigations.

## Notes

This prompt is good for spotting whether models can make a practical call under uncertainty.
