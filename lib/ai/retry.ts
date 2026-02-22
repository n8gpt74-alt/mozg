type RetryOptions = {
  operationName: string;
  timeoutMs: number;
  retries: number;
  onRetry?: (attempt: number, error: unknown) => void;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getStatusCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const statusCodeValue = "statusCode" in error ? Number(error.statusCode) : Number.NaN;
  if (Number.isFinite(statusCodeValue)) {
    return statusCodeValue;
  }

  const statusValue = "status" in error ? Number(error.status) : Number.NaN;
  if (Number.isFinite(statusValue)) {
    return statusValue;
  }

  return null;
}

function isRetryable(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }

  const statusCode = getStatusCode(error);
  if (statusCode !== null) {
    return statusCode >= 500 || statusCode === 429 || statusCode === 408;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("fetch failed") ||
    normalizedMessage.includes("temporarily unavailable") ||
    normalizedMessage.includes("econnreset") ||
    normalizedMessage.includes("enotfound")
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getBackoffMs(attempt: number) {
  const exponential = 200 * 2 ** attempt;
  const jitter = Math.round(Math.random() * 120);
  return exponential + jitter;
}

export async function withTimeoutAndRetry<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      lastError = error;

      const shouldRetry = attempt < options.retries && isRetryable(error);
      if (!shouldRetry) {
        if (isAbortError(error)) {
          throw new Error(`${options.operationName} timed out after ${options.timeoutMs}ms`);
        }

        throw error;
      }

      options.onRetry?.(attempt + 1, error);
      await sleep(getBackoffMs(attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${options.operationName} failed after ${options.retries + 1} attempts`);
}
