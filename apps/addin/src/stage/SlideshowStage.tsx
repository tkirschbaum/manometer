import { formatJoinCode, type SlideItemConfig } from '@pulse/shared';
import { useEffect, useState } from 'react';
import type { AddinController, ControllerState } from '../controller';
import type { LiveState } from '../live/live';
import { Stage, type StageData } from './Stage';

/**
 * True only once `flag` has been true for `ms`. The presenter connection takes a moment after a slide appears;
 * showing "connecting…" (and dimming the chart) during that moment made every slide change flicker.
 */
export function useSustained(flag: boolean, ms: number): boolean {
  const [sustained, setSustained] = useState(false);
  useEffect(() => {
    if (!flag) return;
    const timer = setTimeout(() => {
      setSustained(true);
    }, ms);
    return () => {
      clearTimeout(timer);
      setSustained(false);
    };
  }, [flag, ms]);
  return flag && sustained;
}

/**
 * Remembers theme and join code of the slide on screen for the startup placeholder of the next frame
 * (public/boot.js), so a Pulse slide never starts as a blank frame.
 */
export function useRememberBoot(theme: string, joinCode: string): void {
  useEffect(() => {
    if (!joinCode) return;
    try {
      window.localStorage.setItem('pulse.boot', JSON.stringify({ theme, code: formatJoinCode(joinCode) }));
    } catch {
      // storage unavailable: no placeholder next time
    }
  }, [theme, joinCode]);
}

/** Stage data from the file (join strip, prompt) plus live data when connected; shared by slideshow and edit view. */
export function liveStageData(
  state: ControllerState,
  live: LiveState,
  config: SlideItemConfig | null,
  offline: boolean,
): StageData {
  const { deck, item: draft } = state.settings;
  return {
    language: deck?.settings.slideLanguage ?? 'de',
    theme: deck?.settings.theme ?? 'light',
    showQr: deck?.settings.showQr ?? true,
    joinCode: deck?.joinCode ?? '',
    baseUrl: [deck?.baseUrl, live.deck?.publicBaseUrl].find((url) => url) ?? '',
    qaEnabled: deck?.settings.qaEnabled ?? false,
    config,
    draft,
    item: live.item,
    results: live.results,
    participants: live.participants,
    leaderboard: live.leaderboard,
    qa: live.qa,
    connected: !offline || !deck,
    clockOffset: live.clockOffset,
  };
}

/**
 * Read view (§6.6/§6.7). Renders from the file first (join strip, prompt) and fills in live data when the
 * presenter socket is connected, so the slide is never blank, even offline (principle 4).
 */
export function SlideshowStage({
  controller,
  state,
  live,
}: {
  controller: AddinController;
  state: ControllerState;
  live: LiveState;
}) {
  const connected = live.status === 'connected';
  const offline = useSustained(!connected, 1500);
  const data = liveStageData(state, live, controller.config, offline);
  useRememberBoot(data.theme, data.joinCode);
  return (
    <Stage
      data={data}
      actions={
        connected
          ? {
              hideResponse: (id) => {
                controller.hideResponse(id);
              },
              hideWord: (key) => {
                controller.hideWord(key);
              },
              hideQa: (id) => void controller.live.hideQa(id),
              markAnswered: (id, answered) => void controller.live.markAnswered(id, answered),
              startQuiz: () => {
                controller.command('item:reveal');
              },
              reveal: () => {
                controller.command('item:reveal');
              },
            }
          : {}
      }
      joinOverlay
    />
  );
}
