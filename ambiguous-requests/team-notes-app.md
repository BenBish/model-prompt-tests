# Team Notes App

## Prompt

```text
Build a notes app for teams.
```

## What This Tests

- Clarifying-question behavior.
- Handling of underspecified product requests.
- Whether the model states assumptions before building.
- Scope control.

## Strong Answer Signals

- Asks clarifying questions if in conversational mode.
- If forced to proceed, states conservative assumptions.
- Defines a narrow MVP rather than inventing a full collaboration suite.
- Covers users, permissions, sharing, search, and persistence at an appropriate level.

## Weak Answer Signals

- Builds or specifies a large product without checking intent.
- Ignores collaboration requirements.
- Assumes enterprise features without justification.
- Gives a generic notes app that is not team-oriented.

## Scoring Rubric

- `5`: Handles ambiguity explicitly and proposes a sensible MVP path.
- `4`: Good assumptions with minor missing product details.
- `3`: Plausible but under-clarified.
- `2`: Overbuilt, underbuilt, or poorly scoped.
- `1`: Ignores the ambiguity and core team requirement.

## Variants

- Easier: Add requirements for sharing, comments, and search.
- Harder: Add conflicting stakeholder goals.
- Different angle: Ask the model to create a requirements brief before implementation.

## Notes

This prompt is best run in environments where the model can ask questions. A strong model should not treat it as fully specified.
