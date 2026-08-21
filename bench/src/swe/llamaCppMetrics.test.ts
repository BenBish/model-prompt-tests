import { describe, expect, test, mock, afterEach } from "bun:test";
import { diffLlamaCppMetrics, parseLlamaCppMetrics, sampleLlamaCppMetrics } from "./llamaCppMetrics";

const SAMPLE_METRICS_TEXT = `
# HELP llamacpp:prompt_tokens_total Number of prompt tokens processed.
# TYPE llamacpp:prompt_tokens_total counter
llamacpp:prompt_tokens_total 1500
# HELP llamacpp:prompt_seconds_total Prompt process time
# TYPE llamacpp:prompt_seconds_total counter
llamacpp:prompt_seconds_total 3.2
# HELP llamacpp:tokens_predicted_total Number of generation tokens processed.
# TYPE llamacpp:tokens_predicted_total counter
llamacpp:tokens_predicted_total 8000
# HELP llamacpp:tokens_predicted_seconds_total Predict process time
# TYPE llamacpp:tokens_predicted_seconds_total counter
llamacpp:tokens_predicted_seconds_total 160.5
`;

describe("parseLlamaCppMetrics", () => {
  test("extracts all four counters", () => {
    expect(parseLlamaCppMetrics(SAMPLE_METRICS_TEXT)).toEqual({
      promptTokensTotal: 1500,
      promptSecondsTotal: 3.2,
      predictedTokensTotal: 8000,
      predictedSecondsTotal: 160.5,
    });
  });

  test("returns partial snapshot when some counters are absent", () => {
    expect(parseLlamaCppMetrics("llamacpp:prompt_tokens_total 42\n")).toEqual({
      promptTokensTotal: 42,
    });
  });

  test("returns empty snapshot for unrelated text", () => {
    expect(parseLlamaCppMetrics("not metrics at all")).toEqual({});
  });
});

describe("diffLlamaCppMetrics", () => {
  test("computes deltas between two snapshots", () => {
    const before = parseLlamaCppMetrics(SAMPLE_METRICS_TEXT);
    const after = parseLlamaCppMetrics(
      SAMPLE_METRICS_TEXT.replace("1500", "1700")
        .replace("3.2", "4.0")
        .replace("8000", "8600")
        .replace("160.5", "172.5"),
    );
    expect(diffLlamaCppMetrics(before, after)).toEqual({
      promptTokens: 200,
      promptSeconds: expect.closeTo(0.8, 5),
      predictedTokens: 600,
      predictedSeconds: 12,
    });
  });

  test("clamps a counter reset to zero instead of going negative", () => {
    const before = { predictedTokensTotal: 500, predictedSecondsTotal: 10 };
    const after = { predictedTokensTotal: 50, predictedSecondsTotal: 1 };
    expect(diffLlamaCppMetrics(before, after)).toEqual({
      promptTokens: undefined,
      promptSeconds: undefined,
      predictedTokens: 0,
      predictedSeconds: 0,
    });
  });

  test("returns undefined when either snapshot is missing", () => {
    expect(diffLlamaCppMetrics(undefined, { predictedTokensTotal: 1 })).toBeUndefined();
    expect(diffLlamaCppMetrics({ predictedTokensTotal: 1 }, undefined)).toBeUndefined();
  });
});

describe("sampleLlamaCppMetrics", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches and parses the /metrics endpoint, stripping trailing slashes", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toBe("http://127.0.0.1:18080/metrics");
      return new Response("llamacpp:tokens_predicted_total 10\n", { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const snapshot = await sampleLlamaCppMetrics("http://127.0.0.1:18080/");
    expect(snapshot).toEqual({ predictedTokensTotal: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns undefined on a non-ok response", async () => {
    globalThis.fetch = mock(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await sampleLlamaCppMetrics("http://127.0.0.1:18080")).toBeUndefined();
  });

  test("returns undefined when the fetch throws (dead endpoint)", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    expect(await sampleLlamaCppMetrics("http://127.0.0.1:18080")).toBeUndefined();
  });
});
