export interface Throttled {
  /** Request a run; runs at most once per interval, always including a trailing run. */
  schedule: () => void;
  cancel: () => void;
}

/** Trailing throttle: the first call runs after `ms` at the latest; calls during the wait are coalesced. */
export function trailingThrottle(fn: () => void, ms: number): Throttled {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;
  return {
    schedule() {
      if (timer) return;
      const wait = Math.max(0, lastRun + ms - Date.now());
      timer = setTimeout(() => {
        timer = null;
        lastRun = Date.now();
        fn();
      }, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Debounce: runs `ms` after the last call. */
export function debounce(fn: () => void, ms: number): Throttled {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
