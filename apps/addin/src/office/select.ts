import { withTimeout } from './promise';
import { createHarnessHost, type HarnessControls } from './harnessHost';
import { createOfficeHost } from './officeHost';
import type { OfficeHost } from './types';

declare global {
  interface Window {
    __pulseHistory?: { pushState: History['pushState']; replaceState: History['replaceState'] };
  }
}

/** Office.js may null the history API; put it back after onReady (§6.9). */
function restoreHistory(): void {
  const saved = window.__pulseHistory;
  if (!saved) return;
  if (typeof window.history.pushState !== 'function') window.history.pushState = saved.pushState;
  if (typeof window.history.replaceState !== 'function') window.history.replaceState = saved.replaceState;
}

/** Real Office host inside PowerPoint, otherwise (plain browser, ?harness=1) the in-memory harness. */
export async function selectHost(): Promise<{ host: OfficeHost; harness: HarnessControls | null }> {
  const params = new URLSearchParams(window.location.search);
  const wantsHarness = params.has('harness');
  if (!wantsHarness && typeof Office !== 'undefined') {
    const info = await withTimeout(
      Office.onReady().then((i) => i),
      8000,
      null,
    );
    restoreHistory();
    if (info?.host) return { host: createOfficeHost({ platform: info.platform }), harness: null };
  }
  const { host, controls } = createHarnessHost(params);
  return { host, harness: controls };
}
