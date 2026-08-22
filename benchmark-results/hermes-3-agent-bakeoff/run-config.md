# Run config — BSH-206 Hermes 3-agent bake-off

Date: 2026-08-21 (America/Los_Angeles; batches UTC).
Host: Strix Halo (`fedora`), production llama-swap on `:8080`.
Judge: `judge:openrouter-gpt-5.5`.
Prompts: `hermes/*` × 3 repeats. Tool gate: `bun bench hermes tools` (10 cases).

## Live llama-swap (no production stop)

- `local:hermes-qwen36-27b` → `Qwen3.6-27B-UD-Q4_K_XL.gguf` on 12346 (`-np 2`, 65K/slot), `maxTokens` 8192, concurrency 2.
- `local:hermes-gemma` → `gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf` on 12345, concurrency 2.
- Batch `2026-08-21T23-25-26-316Z-4vel7v`. Tool probe `2026-08-21T23-23-51-281Z-fv0eda`.

## Lab 12348 coexist (`HALO_EXCLUSIVE=0`)

`scripts/run-halo-hermes-eval.sh` with `-c 196608 -np 3 -ctk q8_0 -ctv q8_0 --jinja`, binary `/home/ben/AI/llama-lab/b1311/llama-server`. Production 12345/12346/12347 left running.

| Candidate | Weights | Reasoning | Batch |
| --- | --- | --- | --- |
| `lfm25-8b-a1b` | `LFM2.5-8B-A1B-Q4_K_M.gguf` (4.9 GB) | off | `…-rq8ye7` |
| `ornith-15-q4-noreasoning` | `Ornith-1.5-35B-Q4_K_M.gguf` | off | `…-1up0da` |
| `lightning-30b-instruct` | `NVIDIA-Nemotron-3.5-Lightning-30B-A3B-UD-Q4_K_XL.gguf` (24 GB) | off, temp 0.2 | `…-lleo2m` |
| `qwen36-35b` | `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` | off | `2026-08-22T00-00-29-054Z-krgjvx` |

Cleanup stops only `halo-benchmark-candidate.service`. It does **not** `pkill llama-server` unless `HALO_EXCLUSIVE=1`.
