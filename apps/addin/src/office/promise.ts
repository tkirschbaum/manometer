/** Wraps a callback-style Office API (§6.9). Resolves with the value or null on failure, never throws. */
export function officeCall<T>(call: (callback: (result: Office.AsyncResult<T>) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      call((result) => {
        resolve(result.status === Office.AsyncResultStatus.Succeeded ? result.value : null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
