# Human/judge anchor calibration

BSH-189 makes calibration a publication gate. Automatic judge scores may support comparative claims only while the exact judge/rubric configuration is `calibrated`. `stale`, `failed`, and `uncalibrated` configurations fail closed. Peer rank remains visible only as a secondary signal and is never blended into headline scores.

## Reproduce without model calls

```sh
bun run bench calibrate \
  --anchors bench/calibration/anchors-v1.json \
  --evidence bench/calibration/reference-evidence-v1.json \
  --out bench/calibration/reference-report.md
```

Use `.json` for a machine-readable export or `.html` for an HTML status surface. A non-publication-eligible result exits with status 2. The corpus contains blinded 1/3/5 anchors for instruction following, coding/debugging, safety, and code review. Anchors are calibration inputs only: the run workflow must never send them to candidate models.

The evidence bundle records its immutable experiment id, exact judge provider/model revisions, grader prompt and rubric hashes, panel composition, and run date. Pairwise evidence contains both answer orders and permits `tie`. Reports include monotonic ordering, ceiling/floor concentration, judge disagreement, human coverage, position effects, judge-family residual bias, per-category confusion/agreement, and correlations with response length/format features.

## Human-label workflow

1. A maintainer versions the answer-key corpus. Judging code must call `buildBlindedAnchorPayload` with a per-run salt and send only its `anchors` value; the separate `answerKey` and source corpus never enter the judge request.
2. At least two humans independently label a balanced sample, then adjudicate disagreements. Retain individual sheets outside the blinded judging payload and commit the adjudicated evidence.
3. Run every anchor through the frozen judge panel. For pairwise checks, submit A/B and B/A; ties are valid.
4. Generate Markdown, JSON, and HTML artifacts. Review category-level failures rather than relying on one correlation.
5. Link accepted evidence to the immutable experiment manifest. A judge, revision, grader prompt, rubric, or panel change creates a new configuration that begins `uncalibrated`.

## Cadence and gate

- Recalibrate at least every 90 days and immediately after any judge model/provider revision, grader prompt/rubric change, panel change, or material task-suite revision.
- Minimum evidence is 12 human labels with at least three in each category. Production studies should expand beyond this committed reference minimum and preserve balanced 1/3/5 coverage.
- Fail publication on non-monotonic anchors, excessive extreme-score concentration (>75%), mean judge disagreement above 1.25 score points, pairwise position effects above 15%, low coverage, mutable judge identities, or mismatched corpus versions.
- A stale calibration is visible but not publication-eligible. Raw results remain inspectable; comparative claims, exports intended for publication, and “winner” language must be withheld.

## Reference result and limitations

The committed reference evidence is a live human-labeled workflow artifact for validating the pipeline and thresholds. It is intentionally small, uses a frozen reference panel rather than a paid production judge roster, and must not be represented as evidence that any external model family is calibrated. Its purpose is to keep the command, schema, status surfaces, tie handling, and fail-closed behavior reproducible in source control.
