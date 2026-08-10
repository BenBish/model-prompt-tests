# Spike: llm-council-style multi-model deliberation for Model Prompt Tests

**Issue:** [BSH-149](https://linear.app/bshp/issue/BSH-149)  
**Linear doc:** [Spike: llm-council multi-model deliberation](https://linear.app/bshp/document/spike-llm-council-multi-model-deliberation-bsh-149-a42b8d9bd9e0)  
**Date:** 2026-08-10  
**Status:** Recommendation complete  
**Reference:** [karpathy/llm-council](https://github.com/karpathy/llm-council)

## Recommendation

**Adopt phased.** Do not port llm-council as a chat product. Fold the useful stages into the existing bench harness as optional scoring / synthesis modes, only where they serve lab goals.

| Stage | Adopt? | When |
| --- | --- | --- |
| Stage 1 — parallel multi-model answers | **Already done** (core `run`) | Keep as the default path |
| Stage 2 — anonymized peer ranking | **Yes, optional** | After rubric/multi-judge path is stable; experiment first |
| Stage 3 — chairman synthesis | **Later, optional** | Not MVP; separate “best answer” mode, not default grading |

**Rationale in one line:** Model Prompt Tests is an evaluation lab, not a multi-model chat app. Stage 1 matches us already; Stage 2 can add a relative-quality signal; Stage 3 solves a different problem (answer production) and should stay behind a flag.

---

## What llm-council does

Karpathy’s llm-council is a local ChatGPT-like UI over OpenRouter. On each user query:

1. **Stage 1 — First opinions:** Same question to all council models in parallel; show tabs of independent answers.
2. **Stage 2 — Review:** Each model sees the *other* responses with identities anonymized (Response A/B/C…), then ranks them for accuracy and insight (reduces brand favoritism).
3. **Stage 3 — Chairman:** A designated chairman model synthesizes responses (+ rankings context) into one final answer for the user.

Default roster (config-driven): GPT, Gemini, Claude, Grok via OpenRouter; chairman is one of them (e.g. Gemini). The project is explicitly a vibe-coded Saturday hack—inspiration, not a library to vendor.

**Cost shape (N council members):** roughly **N** (answers) **+ N** (rankings) **+ 1** (chairman) ≈ **2N+1** LLM calls per query, with Stage 2 prompts large (full peer texts). Latency is dominated by the slowest Stage 1 call, then the slowest Stage 2 call, then chairman—often **~2–3×** wall-clock of a single parallel-only round when stages are sequential.

---

## Mapping to Model Prompt Tests goals

| Lab goal | Stage 1 (parallel answers) | Stage 2 (peer rank) | Stage 3 (chairman) |
| --- | --- | --- | --- |
| **Prompt regression** (did model quality change on a fixed suite?) | Strong — already `run` + SQLite history | Weak alone (relative ranks drift with roster) | Weak (synthesis hides per-model regression) |
| **Model comparison** (which model is better on this prompt?) | Strong — matrix already | Strong *complement* — relative order + agreement | Weak for comparison (collapses models) |
| **Quality grading** (rubric / dimensions / multi-judge) | Input only | Partial — ordinal signal, not 1–5 rubric | Not grading |
| **Optional “best answer” synthesis** | Inputs | Ranks feed chairman | **Primary fit** |

### What we already have

The bench harness (`bench/`) already covers the *evaluation* half of the council idea without deliberation UI:

- **Parallel multi-model candidates** via `bun run bench run … --models …` (Stage 1 equivalent).
- **Fixed-rubric LLM judges**, optional dimensions, multi-judge (`--judges`), peer-only headline scores (self-judge excluded).
- **Repeats**, cost/latency tracking, HTML + assessment reports, export/publish.
- **SWE / agent path** separate from prompt runs—different product surface; not where council ranking belongs first.

Important distinction: our “peer-only” scoring means *judges that are not the candidate itself*. It is **not** anonymized ranking of candidate outputs against each other. Rubric scores are absolute (1–5 vs criteria); council ranks are relative (A > B > C among this batch).

---

## Recommendation detail

### Primary use cases for this lab

1. Compare models on curated prompts with stable rubrics.
2. Catch regressions / variance with history and reports.
3. Optionally produce writeups (export/publish, narrative assessment).

Council Stage 2 helps (1) as a *second signal*. Stage 3 helps a new optional use case—“give me the best combined answer for this hard prompt”—not the core leaderboard.

### Cost and latency vs single-model / parallel-only

Assume N candidates, J judges, average output tokens similar across calls.

| Mode | Approx. LLM calls | Notes |
| --- | --- | --- |
| Single model + 1 judge | 2 | Baseline cheap cell |
| Parallel only + 1 judge | N + N = 2N | Current default-ish path |
| Parallel + multi-judge | N + N×J | Already supported |
| + Peer ranking (Stage 2) | +N ranking calls | Ranking prompts include all peer texts → token cost ≫ simple judge |
| + Chairman (Stage 3) | +1 | Large context; optional |

**Rough multipliers:** Stage 2 alone can **double** call count vs parallel+single-judge and **more than double** tokens (each ranker re-reads N answers). Full council vs parallel-only is typically **~2× calls** and **2–3× wall time** if stages are sequential. That is acceptable for *occasional* deep dives; bad as the default for `run all` on a large matrix.

### Anonymized peer ranking vs rubric / judge / human

| Approach | Strengths | Weaknesses |
| --- | --- | --- |
| **Rubric judge (current)** | Aligns to prompt intent; comparable across batches if judge fixed; dimensions | Judge bias; absolute scale compression |
| **Multi-judge median (current)** | Robustness to one bad judge | Cost ×J; still absolute rubric |
| **Anonymized peer rank (council)** | Reduces brand favoritism; relative discrimination when scores clump | Roster-dependent; hard to trend over time; rankers may still share preferences |
| **Human** | Gold standard for calibration | Slow; not for every cell |

**Verdict:** Peer ranking is a **useful experimental signal**, not a replacement for rubric judges. Best use: store ranks alongside scores and measure correlation / disagreement on hard prompts. Do not replace `avgScore` headlines with rank alone.

### Is chairman required for MVP?

**No.** Chairman optimizes *answer quality for a human reader*, not *fair comparison of models*. MVP for any “council” work in this repo is:

1. Keep Stage 1 + rubric judges as default.
2. Optionally add Stage 2 ranks as stored side data + report section.
3. Add Stage 3 only if we want an explicit “synthesize best answer” CLI/report mode.

### Suggested model roster and chairman policy

- **Council roster:** Reuse `bench/models.json` enabled matrix (or an explicit `--council` subset). Prefer **3–4 diverse providers** for ranking experiments (same spirit as llm-council’s GPT/Gemini/Claude/Grok set). Avoid forcing local-only models into ranking until they can handle long multi-answer contexts.
- **Chairman:** **Configurable**, default to a strong hosted model that is *not* required to be in the candidate set (mirrors separate `judge.modelId` today). Fixed-in-code chairman is too rigid for a lab.
- **Anonymization:** Labels A/B/C with shuffled mapping per ranker call; never pass model ids in Stage 2 prompts. Persist mapping for report deanonymization only after ranks are stored.

---

## Non-goals

- **Mission Control chat UI** for council deliberation — MC stays ops/observability; may later ingest telemetry (cost, tokens, latency, rank winners) as a data source only.
- **Double-counting spend with Mission Control** — all bench cost attribution stays in Model Prompt Tests SQLite / reports; any MC export is derived, not a second billing source of truth.
- **Replacing agent runtimes** (Claude Code, Codex, SWE harnesses) with a council loop — SWE verification is tests + process judges, not multi-model chat ranking.
- **Vendoring or forking llm-council** as the product surface — take the *protocol*, not the React/FastAPI app.
- **Making full council the default for `run all`** — too expensive and wrong metric for regression leaderboards.

---

## Phased implementation tickets

Filed from this spike (parent [BSH-149](https://linear.app/bshp/issue/BSH-149)):

| Priority | Issue | Scope |
| --- | --- | --- |
| P1 | [BSH-153](https://linear.app/bshp/issue/BSH-153) | Optional anonymized peer ranking (Stage 2) in bench |
| P2 | [BSH-150](https://linear.app/bshp/issue/BSH-150) | Optional chairman synthesis mode (Stage 3) |
| P3 | [BSH-151](https://linear.app/bshp/issue/BSH-151) | Meta-eval: ranks vs multi-judge calibration |
| P4 | [BSH-152](https://linear.app/bshp/issue/BSH-152) | Optional MC telemetry export (consumer only) |

**Not tickets:** Porting llm-council frontend; changing default `run all` to full council; putting deliberation product ownership in Mission Control.

---

## Decision log

| Decision | Choice |
| --- | --- |
| Product home | Model Prompt Tests (confirmed in issue) |
| Overall | **Adopt phased** |
| Default path | Parallel candidates + rubric (± multi-judge) |
| Peer ranking | Optional add-on; experimental signal first |
| Chairman | Later optional synthesis mode; not MVP |
| UI | No llm-council-style chat in this repo for now |
| MC | Telemetry consumer only, later |

---

## References

- [karpathy/llm-council](https://github.com/karpathy/llm-council) — Stage 1/2/3 design and OpenRouter council config
- [bench/README.md](../bench/README.md) — existing multi-model run, judges, peer-only aggregation, reports
- Linear: BSH-149
