import type { Result } from './types.js';

/**
 * Resolves after `ms` milliseconds.
 * Built by hand with `new Promise` to show how callback APIs such as `setTimeout` become Promises.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Turns a Promise into a `Result`, so success and failure are both plain values
 * and the caller does not need `try/catch`.
 */
export async function toResult<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
