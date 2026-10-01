import type { AddinController, ControllerState } from '../controller';
import type { LiveState } from '../live/live';
import { Stage } from './Stage';

/**
 * Read view (§6.6/§6.7). Renders from the file first (join strip, prompt) and fills in live data when the
 * presenter socket is connected, so the slide is never blank, even offline (principle 4).
 */
export function SlideshowStage({ controller, state, live }: { controller: AddinController; state: ControllerState; live: LiveState }) {
  const { deck, item: draft } = state.settings;
  const config = controller.config;
  const connected = live.status === 'connected';
  return (
    <Stage
      data={{
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
        connected: connected || !deck,
        clockOffset: live.clockOffset,
      }}
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
    />
  );
}
