---
type: fixture
lifecycle: active
graderVersion: 1.0.0
oracleSolution: validation/reference/src
flawedSolutions: validation/skips-dedupe/src
runtimePrerequisites: bun
verifierEnvironments: linux-bun-1.3
verify: bun test
verifyTimeoutMs: 30000
agentTimeoutMs: 900000
tags: typescript, feature, long-session
---
# Finish the CSV account import pipeline

## Task

```text
src/pipeline.ts is a five-stage CSV import pipeline for account signups. Stage 1 (parseCsv) is
already implemented - don't change it. The rest is incomplete; work through them in order, running
the tests after each stage so you catch problems before they compound into the next stage:

1. `validateRow` currently only rejects a missing email. Extend it to also reject a missing name,
   a `signupDate` that doesn't parse to a valid date, and a `plan` that is present but not one of
   "free", "pro", or "enterprise". A blank plan must still be accepted here.
2. `transformRow` is unimplemented. It must lowercase and trim the email, trim the name, parse
   `signupDate` into a `Date`, and default a blank plan to "free".
3. `dedupeRecords` is unimplemented. Accounts can appear more than once with the same email in
   different casing (transformRow has already normalized that by this point) - when that happens,
   keep only the record with the most recent `signupDate` and drop the rest.
4. `runImport` is unimplemented. Wire the stages together: parse the CSV, validate each row and
   record skipped rows with their reason instead of throwing, transform the rows that pass
   validation, then dedupe the transformed records before returning
   `{ imported, skipped }`.

Run the tests to confirm your change. Do not modify the test files or parseCsv.
```

## Judging Guidance

- Reward implementing and testing each stage before moving to the next, rather than writing all
  four functions blind and debugging everything at once.
- Reward keeping the most-recent-by-signupDate record on a duplicate email, not the first or last
  one seen positionally.
- Penalize a `runImport` that throws on an invalid row instead of recording it in `skipped`.
- Penalize a no-op or partial `dedupeRecords` that leaves duplicate emails in the output.

## Scoring Dimensions

- `correctness` (weight 3): All four stages behave as specified, including the duplicate-email and invalid-row edge cases.
- `incremental-approach` (weight 2): Evidence (via the task's own multi-stage structure and test runs) of building and verifying stage by stage rather than one large untested change.

## Validation

Runs under 2 seconds with Bun. The reference solution implements all four stages, including a
most-recent-wins dedupe by signupDate. `skips-dedupe` implements validation, transformation, and
orchestration correctly but leaves `dedupeRecords` as a passthrough, so it passes the visible
no-duplicates happy path but fails the hidden duplicate-email test.
