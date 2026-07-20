# Business Metrics Diagnosis

## Prompt

```text
Given this monthly data, identify the most important business concern and suggest what to investigate next. Do not calculate every possible metric; focus on the signal that matters most.

Month | Revenue | New Customers | Churned Customers | Support Tickets
Jan   | $82,000 | 140           | 28                | 310
Feb   | $88,000 | 155           | 31                | 330
Mar   | $91,000 | 160           | 35                | 390
Apr   | $94,000 | 166           | 48                | 520
May   | $96,000 | 170           | 62                | 710
Jun   | $97,000 | 172           | 79                | 940
```

## What This Tests

- Signal extraction from simple business data.
- Prioritization over exhaustive analysis.
- Ability to connect churn and support load.
- Next-step investigation planning.

## Strong Answer Signals

- Identifies rising churn and support tickets as the main concern despite revenue growth.
- Notes that new customer growth is flattening while churn accelerates.
- Suggests investigating product quality, onboarding, recent releases, support categories, and cohort behavior.
- Avoids overclaiming causality from the table alone.

## Weak Answer Signals

- Focuses only on revenue increasing.
- Calculates many metrics without a clear conclusion.
- Claims support tickets caused churn without evidence.
- Gives generic growth advice unrelated to the data.

## Scoring Rubric

- `5`: Finds the key signal, explains it clearly, and proposes focused investigation.
- `4`: Good diagnosis with minor missing nuance.
- `3`: Notices some issues but lacks prioritization.
- `2`: Mostly calculations or generic commentary.
- `1`: Misreads the data or chooses the wrong concern.

## Scoring Dimensions

- `signal-prioritization` (weight 3): Identifies rising churn and support load as the key concern despite revenue growth, rather than drowning it in exhaustive metrics.
- `causal-discipline` (weight 2): Avoids overclaiming causality (e.g., support tickets causing churn) from the table alone.
- `next-steps` (weight 2): Proposes focused, relevant investigation steps rather than generic advice.

## Variants

- Easier: Ask for only the biggest concern in one paragraph.
- Harder: Add active customer counts and ask for churn-rate estimates.
- Different angle: Ask for the answer as an executive summary.

## Notes

This prompt tests judgment: revenue growth can distract from deteriorating retention and support load.
