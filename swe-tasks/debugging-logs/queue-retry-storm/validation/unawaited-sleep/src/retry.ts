export interface RetryOptions {
  baseDelayMs: number;
  maxAttempts: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bumped the base delay to space out retries further.
export function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attempt;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= opts.maxAttempts) throw err;
      const delay = backoffDelayMs(attempt, opts.baseDelayMs * 2);
      sleep(delay);
    }
  }
}
