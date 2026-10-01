import { createTranslator, languageFromLocale } from '@pulse/shared';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AddinController } from './controller';
import { Editor } from './editor/Editor';
import { useLive } from './live/live';
import { HarnessPanel } from './office/HarnessPanel';
import type { HarnessControls } from './office/harnessHost';
import type { OfficeHost } from './office/types';
import { SlideshowStage } from './stage/SlideshowStage';

export function App({ host, harness }: { host: OfficeHost; harness: HarnessControls | null }) {
  const [controller] = useState(() => new AddinController(host));
  useEffect(() => {
    controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const live = useLive(controller.live);
  // Add-in UI follows Office's display language; the slides follow the deck setting (§6.8).
  const t = useMemo(() => createTranslator(languageFromLocale(host.displayLanguage)), [host]);
  // Until the view is known, show the stage if there is something to show: never a blank slide.
  const showStage = state.view === 'read' || (!state.viewKnown && state.settings.deck !== null);
  return (
    <>
      {showStage ? (
        <SlideshowStage controller={controller} state={state} live={live} />
      ) : (
        <Editor controller={controller} state={state} live={live} t={t} webUnsupported={host.platform === 'OfficeOnline'} />
      )}
      {harness ? <HarnessPanel controls={harness} /> : null}
    </>
  );
}
