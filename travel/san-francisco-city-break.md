# San Francisco City Break

## Prompt

```text
Plan a 3-day city break to San Francisco for someone who likes food, walking, bookstores, scenic views, and low-key nightlife. Include neighborhoods, daily pacing, transit notes, and rainy-day alternatives. Avoid packing the schedule too tightly.
```

## What This Tests

- Practical itinerary design.
- Personalization to stated interests.
- Geographic coherence and pacing.
- Handling alternatives and transit.

## Strong Answer Signals

- Groups activities by nearby neighborhoods instead of zigzagging across the city.
- Balances walking, food, views, bookstores, and low-key evening options.
- Includes realistic transit and weather alternatives.
- Leaves unscheduled space.

## Weak Answer Signals

- Overloads each day with too many stops.
- Recommends generic tourist hits without matching interests.
- Gives geographically inefficient routing.
- Omits transit or rainy-day alternatives.

## Scoring Rubric

- `5`: Coherent, paced, interest-matched itinerary with practical logistics.
- `4`: Strong itinerary with minor routing or personalization gaps.
- `3`: Acceptable but generic or somewhat overpacked.
- `2`: Impractical routing, poor pacing, or weak fit to interests.
- `1`: Bare list of attractions with no usable plan.

## Scoring Dimensions

- `geographic-coherence` (weight 3): Groups activities by neighborhood instead of zigzagging across the city.
- `personalization` (weight 3): Matches the stated interests (food, walking, bookstores, views, low-key nightlife).
- `pacing-and-logistics` (weight 2): Leaves unscheduled space and includes realistic transit and rainy-day alternatives.

## Variants

- Easier: Plan one perfect day in San Francisco.
- Harder: Add budget constraints, mobility limits, and dinner reservations.
- Different angle: Ask for a plan based from a specific hotel neighborhood.

## Notes

Because travel details change, this prompt can optionally be run with browsing enabled to test source use and freshness.
