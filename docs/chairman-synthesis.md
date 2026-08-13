# Chairman synthesis (council Stage 3)

**Issue:** [BSH-150](https://linear.app/bshp/issue/BSH-150)  
**Depends on:** Stage 1 candidate answers (always). Optional Stage 2 peer ranks ([BSH-153](https://linear.app/bshp/issue/BSH-153)) as a hint.

## When to use

Use chairman synthesis when you want **one best combined answer** for a hard prompt: a writeup, a plan, or a “what should we tell the user” artifact. The chairman sees candidate answers labeled with model ids (this is *answer production*, so identities stay visible) and, when present, a best-first peer-rank hint.

## When not to use

Do **not** use synthesis for:

- Prompt regression / leaderboards (`avgScore` stays the headline)
- Fair model comparison (the chairman *collapses* models into one text)
- Default `run all` (one extra large-context call per prompt/repeat, on top of candidates and any ranks)

Ranks and rubric scores remain the comparison signals. Synthesis never writes `scores` and never changes `avgScore`.

## Configuration

Chairman model id is configurable, like the judge. Resolution order:

1. `--chairman <id>`
2. `BENCH_CHAIRMAN_MODEL_ID`
3. `chairman.modelId` in `bench/models.json`
4. Fallback: `judge.modelId`

```
bun run bench models set-chairman judge:opus
```

Prefer a strong hosted model. It does **not** have to be in the candidate `--models` set.

## Commands

One-shot with a run (does not change default scoring unless you pass the flag):

```
bun run bench run <prompt> --models id1,id2,id3 --peer-rank --synthesize --chairman judge:opus
bun run bench run <prompt> --models id1,id2,id3 --synthesize --dry-run
```

Follow-on from an existing batch (Stage 1 answers alone, or with stored peer ranks):

```
bun run bench synthesize --latest --dry-run
bun run bench synthesize --batch <run_batch_id> --chairman judge:opus
```

Each eligible (prompt, repeat) group with **≥2** ok candidates becomes **one** chairman call. Cost/tokens/latency are stored on `syntheses` as their own call type.

## Report

`bun run bench report` adds a **Chairman synthesis (answer production)** section: chairman id, candidate model ids, optional peer-rank hint, cited sources, and the synthesized text. Same content appears in the assessment markdown.

## Cost

Roughly **+1 large-context call** per prompt/repeat versus a parallel-only run. Combined with `--peer-rank` this is the “full council” shape (~2N+1 calls). Use it for occasional deep dives, not as the default matrix.
