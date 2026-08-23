# Experiment manifest contract

Every newly scheduled benchmark creates one immutable, content-addressed experiment. Its id is `exp_` plus the SHA-256 of canonical JSON (object keys sorted recursively; undefined fields omitted). Candidate rows reference it directly; judge, peer-rank, synthesis, and tool-probe rows inherit the same reference. Existing rows remain readable with `experiment_id = NULL` and exports mark them as legacy provenance.

The versioned manifest freezes repository SHA/dirty state, prompt and rubric hashes, exact candidate and judge identities, generation limits, harness configuration, permissions, repeats, exclusions, timestamps, and an execution-domain/environment fingerprint. Exports copy the stored manifest and redact the hostname and home path; they never reconstruct it from current configuration. `bun run bench reproduce --batch <id>` verifies the content address locally and makes no model calls.

Local aliases are publication-eligible only when backed by a cached weights SHA-256 or immutable upstream revision. A cached import/download checksum avoids rehashing large weights on every run.

## Comparative claims

Semantic comparisons require identical suite, tasks and prompt hashes, graders/rubrics, models, harness, prompts, limits, and tool permissions. `report --compare` lists every difference and refuses incompatible experiments unless `--allow-incompatible` is explicit.

Environment differences are reported separately. Quality/correctness evidence can be compared across the `interactive-lab` Omarchy laptop and `production-slot-arena` Fedora server after semantic validation. Latency, TTFT, throughput, memory, energy, and stability require an identical environment fingerprint; cross-domain performance rankings are otherwise prohibited. Fingerprints omit hostnames and record normalized OS/kernel, CPU/accelerator, memory, runtime/driver/build flags, power/thermal state, topology, concurrency, and whether production services were stopped or co-resident.
