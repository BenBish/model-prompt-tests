# Human anchor calibration

**Status: CALIBRATED**
**Publication eligible: yes**

## Gate findings

- None.

| Metric | Result |
| --- | ---: |
| Human coverage | 100.0% |
| Ceiling/floor concentration | 62.5% |
| Mean judge disagreement (σ) | 0.083 |
| Pairwise position effect | 0.0% |
| Explicit ties | 2 |

## Per-category agreement and confusion

| Category | Judgments | Exact | Within one | Human→judge confusion |
| --- | ---: | ---: | ---: | --- |
| instruction-following | 6 | 100.0% | 100.0% | 1->1:2, 3->3:2, 5->5:2 |
| coding-debugging | 6 | 83.3% | 100.0% | 1->1:1, 1->2:1, 3->3:2, 5->5:2 |
| safety | 6 | 83.3% | 100.0% | 1->1:2, 3->3:1, 3->4:1, 5->5:2 |
| code-review | 6 | 100.0% | 100.0% | 1->1:2, 3->3:2, 5->5:2 |

## Judge-family bias

- a->unknown: +0.000 score points vs human
- b->unknown: +0.167 score points vs human

## Style correlations

- words: 0.872
- headings: n/a
- bullets: 0.255
- codeBlocks: n/a

Peer rank remains a secondary signal and is not blended into headline scores.
