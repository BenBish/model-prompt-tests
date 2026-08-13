# Peer-rank vs multi-judge calibration

**Issue:** [BSH-151](https://linear.app/bshp/issue/BSH-151)  
**Depends on:** [BSH-153](https://linear.app/bshp/issue/BSH-153) peer ranking (`run --peer-rank`)  
**Status:** Tooling + recommendation checked in. Live batch numbers are regenerated, not vendored.

## Recommendation

**Keep peer ranks as a side signal only. Do not let Borda scores, average ranks, or inversion counts influence `avgScore` headlines, badges, default sort, or regression leaderboards.**

Rationale (does not depend on any one batch's correlation being low):

- Rubric medians are *absolute* and trendable across batches if the judge roster is held fixed. Peer ranks are *relative* to whoever was in this roster — they cannot be the regression headline.
- High Spearman/Kendall agreement only means the two signals usually order models the same way. It does not make ranks a substitute for a 1–5 rubric, and it does not justify blending Borda points into `avgScore`.
- Low agreement is useful: ranks may discriminate when scores clump. That is a reason to *show* ranks as a secondary view (already in `report`), not to promote them.
- Human labels, when present, are the calibration gold standard. They still do not change how headlines are computed.

This matches the BSH-149 spike verdict: peer ranking is a useful experimental signal, not a replacement for rubric judges.

## Fixed calibration subset

| Prompt | Axis |
| --- | --- |
| `instruction-following/five-bullet-summary` | Instruction following / format |
| `debugging/javascript-debounce` | Technical correctness |
| `safety-risk/failed-production-migration` | Risk / judgment |
| `code-review/senior-pr-review` | Review taste |

Prefer **3–4 diverse providers** as candidates and **at least two peer judges** (not the candidates themselves when possible). Peer ranking adds ≈ +N large-context calls per prompt.

`bun run bench run calibration` resolves exactly these four files. It is not `run all`.

## Reproducible command sequence

```
bun run bench run calibration --models <id1,id2,id3> --judges <j1,j2> --peer-rank
bun run bench calibrate --batch <run_batch_id> --out docs/peer-rank-calibration.md
```

Print the subset only:

```
bun run bench calibrate --subset
```

Optional human labels (best-first ranking *or* higher-is-better scores per group):

```json
{
  "groups": [
    {
      "promptId": "debugging/javascript-debounce",
      "repeatIndex": 0,
      "ranking": ["model-a", "model-b", "model-c"]
    }
  ]
}
```

```
bun run bench calibrate --batch <run_batch_id> --human path/to/labels.json --out docs/peer-rank-calibration.md
```

## What `calibrate` compares

For each (prompt, repeat) group that has both signals for at least two models:

| Signal | Source | Orientation |
| --- | --- | --- |
| Peer rank | Borda aggregate `averageRank` from `peer_ranks` | 1 = best |
| Multi-judge median | Peer-only median of rubric scores (self-judging excluded — same rule as report headlines) | 5 = best |
| Human (optional) | `--human` ranking or scores | 1 = best |

Metrics:

- **Spearman ρ** of midranks (handles ties)
- **Kendall τ-b** (ties on one side ignored in the denominator)
- **Pairwise inversion rate**: share of strict pairs where peers prefer A over B and judges prefer B over A

Spearman/Kendall means in the report are **unweighted across groups** (a 2-model cell counts the same as a 4-model cell). The inversion rate is pair-weighted. +1 = same order, 0 = unrelated, −1 = reversed. Groups with fewer than two models that have both a rank aggregate and a peer-judge median are skipped.

Headline `avgScore` is never rewritten by this command.

## Worked example (fixture, not a live batch)

These numbers come from the unit fixtures in `bench/src/calibrate/compare.test.ts`. They document expected metric polarity; they are not lab results.

**Agreement.** Peers rank A > B > C. Multi-judge medians are 5, 3.5, 1.5.

| Metric | Value |
| --- | --- |
| Spearman ρ (peer vs judge) | +1.000 |
| Pairwise inversions | 0 / 3 |

**Disagreement.** Peers rank A > B > C. Multi-judge medians are 1, 3, 5.

| Metric | Value |
| --- | --- |
| Spearman ρ (peer vs judge) | −1.000 |
| Pairwise inversions | 3 / 3 |

**Self-judge exclusion.** Candidate A self-scores 5 and a peer judge scores 1 → the median used for calibration is **1**, matching report headlines.

**Human labels.** When a `--human` ranking matches both peers and judges, Spearman vs human is +1. When it matches only one signal, that shows up as a gap between `peer vs human` and `judge vs human`.

## Live batch results

No live multi-model calibration batch is committed (API cost, roster drift). After running the command sequence above, `calibrate --out docs/peer-rank-calibration.md` replaces this file with a dated report that includes per-prompt tables and inversion lists. Keep the **Recommendation** section unchanged if you hand-edit.

To inspect without overwriting this document:

```
bun run bench calibrate --batch <run_batch_id>
```

## Interpretation guide

| Pattern | What to do |
| --- | --- |
| Spearman ≈ 1 | Signals agree on order. Still do not replace headlines — ranks are not trendable. |
| Spearman ≈ 0 | Independent information. Use ranks as a secondary view when scores clump. |
| Spearman < 0 | Systematic disagreement. Inspect those prompts before trusting either signal. |
| High inversion rate on one prompt | That cell is the interesting disagreement; quote it, don't average it away. |

## Non-goals

- Changing default `run all` to include `--peer-rank`
- Blending ranks into `avgScore`, badges, or published site winners
- Chairman synthesis (BSH-150)
- Requiring human labels on every cell
