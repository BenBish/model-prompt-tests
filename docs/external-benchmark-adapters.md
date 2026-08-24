# External benchmark adapter contract

`bench external` invokes maintained upstream runners instead of translating their task definitions. Adapter schema version 1 covers discovery, immutable version resolution, dry-run planning, execution, common outcome normalization, artifact capture, and provenance. External results are labeled `source: external`; the complete native result, metrics, transcript, logs, citation, and license remain alongside the normalized `passed | failed | partial | error` outcome.

The committed catalog contains one small reference task for each ecosystem:

- Inspect AI: `inspect-evals/hello-world` ([Inspect documentation](https://inspect.aisi.org.uk/), MIT).
- Harbor / Terminal-Bench: `terminal-bench/hello-world` ([Harbor](https://github.com/laude-institute/harbor), Apache-2.0). The catalog requires an isolated agent container and a locked verifier container.
- lm-evaluation-harness: `lm-eval/hellaswag` ([lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness), MIT; dataset licensing remains task-specific).

Dataset and runner versions are immutable manifest inputs. `latest`, `main`, and `master` are rejected. The cache key hashes the ecosystem, task identity, dataset and runner versions, exact model, command, isolation settings, and adapter configuration, so resume tooling cannot reuse a result under a different model, task, or configuration.

## Installation and reproduction

Install each runner in its own environment using its upstream instructions. None is a dependency of the bench package. The startup check reports a missing executable as `missing-dependency`; a runner that starts and exits unsuccessfully is recorded as a candidate/execution `error` with its native logs.

```sh
# Discovery and zero-call plan
bun run bench external list
bun run bench external plan --ecosystem inspect --task inspect-evals/hello-world --model openai/gpt-4o-mini

# Execute into a durable artifact directory
bun run bench external run --ecosystem inspect --task inspect-evals/hello-world \
  --model openai/gpt-4o-mini --out bench/reports/external/inspect-hello
```

Use `--config path/to/catalog.json` to supply an organization-pinned catalog. Each ecosystem uses a native result glob (`resultPattern`) and artifact globs rather than assuming a shared filename. The declared runner version is checked against the installed runner's version probe and both declared and observed versions are preserved in the versioned `external-result.json` envelope. The offline integration tests execute a pinned fixture for every ecosystem:

```sh
bun test bench/src/external/adapter.test.ts
```

Before publishing, confirm each upstream task's dataset-specific terms and citation. The catalog license is descriptive provenance, not a replacement for upstream legal metadata.
