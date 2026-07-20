# Evaluation Rubric

## Prompt

```text
Create a rubric for evaluating answers to this prompt. Include criteria for correctness, completeness, assumptions, usability, and risk.

Prompt to evaluate:
"Plan a 3-day city break to San Francisco for someone who likes food, walking, bookstores, scenic views, and low-key nightlife. Include neighborhoods, daily pacing, transit notes, and rainy-day alternatives. Avoid packing the schedule too tightly."
```

## What This Tests

- Meta-evaluation ability.
- Criteria design.
- Understanding of task-specific quality.
- Balanced scoring.

## Strong Answer Signals

- Creates criteria that match the travel-planning task, not generic writing quality only.
- Includes clear scoring anchors.
- Covers practicality, personalization, pacing, logistics, and risk/contingencies.
- Explains how to compare answers consistently.

## Weak Answer Signals

- Produces vague criteria like "good detail".
- Ignores the stated required elements.
- Does not include scoring anchors.
- Overweights prose style over itinerary usefulness.

## Scoring Rubric

- `5`: Specific, usable rubric with clear criteria and score anchors.
- `4`: Good rubric with minor gaps.
- `3`: Usable but generic.
- `2`: Too vague to support consistent evaluation.
- `1`: Does not produce a rubric.

## Scoring Dimensions

- `task-specificity` (weight 3): Criteria are specific to itinerary planning, not generic writing quality.
- `scoring-anchors` (weight 3): Includes clear, usable score anchors rather than vague labels like "good detail".
- `coverage` (weight 2): Covers practicality, personalization, pacing, logistics, and risk/contingencies.

## Variants

- Easier: Ask for only five pass/fail checks.
- Harder: Require weighted criteria totaling 100 points.
- Different angle: Ask for a rubric that can be used by two human evaluators independently.

## Notes

This prompt helps bootstrap evaluation discipline for other prompts in this repo.
