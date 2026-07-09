export interface RetriableError extends Error {
  status?: number;
}

function isRetriable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as RetriableError).status;
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  // Errors we threw ourselves for non-2xx responses embed the status in the
  // message (see providers/*.ts); fall back to sniffing it out of there.
  const match = err.message.match(/error (\d{3}):/);
  if (match) {
    const code = Number(match[1]);
    return code === 429 || code >= 500;
  }
  // Fetch uses TypeError for network failures and DOMException-style names for
  // aborted/timed-out requests. Other errors are configuration or programming
  // failures unless explicitly classified above.
  return (
    err instanceof TypeError ||
    err.name === "AbortError" ||
    err.name === "TimeoutError"
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts - 1 || !isRetriable(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
