import type { ModelMatrixEntry } from "../providers/types";

// The run-matrix: which (provider, model) pairs `bench run` executes against.
// Filter down to a subset with `--models id1,id2`. Model name strings drift as
// providers ship new versions — check current docs before relying on these.
export const modelMatrix: ModelMatrixEntry[] = [
  {
    id: "anthropic:sonnet",
    kind: "anthropic",
    modelName: "claude-sonnet-5",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "anthropic:haiku",
    kind: "anthropic",
    modelName: "claude-haiku-4-5-20251001",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai:gpt-4o-mini",
    kind: "openai-compatible",
    providerId: "openai",
    modelName: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnvVar: "OPENAI_API_KEY",
  },
  {
    id: "openrouter:llama-3.3-70b",
    kind: "openai-compatible",
    providerId: "openrouter",
    modelName: "meta-llama/llama-3.3-70b-instruct",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/model-prompt-tests",
      "X-Title": "model-prompt-tests bench",
    },
  },
  {
    // llama-swap proxy (Strix Halo ROCm toolbox host, reached over Tailscale),
    // routing to a llama-server instance running Gemma 4 26B A4B.
    id: "local:gemma",
    kind: "openai-compatible",
    providerId: "llama-swap",
    modelName: "gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",
    baseUrl: "https://fedora.taile952db.ts.net:8080/v1",
    maxConcurrent: 1,
  },
  {
    // AMD Lemonade local server, OpenAI-compatible API.
    id: "local:lemonade",
    kind: "openai-compatible",
    providerId: "lemonade",
    modelName: "local-model",
    baseUrl: "http://localhost:8000/api/v1",
    apiKeyEnvVar: "LEMONADE_API_KEY",
    maxConcurrent: 1,
  },
];

// Fixed, separate judge model used to score every candidate run. Keep this
// distinct from any entry you're actively testing to avoid self-preference
// bias. Override per-invocation with `--judge <id>` or BENCH_JUDGE_MODEL_ID.
export const judgeModel: ModelMatrixEntry = {
  id: "judge:opus",
  kind: "anthropic",
  modelName: "claude-opus-4-8",
  apiKeyEnvVar: "ANTHROPIC_API_KEY",
};
