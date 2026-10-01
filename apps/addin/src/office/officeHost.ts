import { ADDIN_SETTINGS_KEY } from '@pulse/shared';
import { deckLinkSchema } from '../model/schemas';
import { officeCall, withTimeout } from './promise';
import type { DeckLink, OfficeHost, Platform, View } from './types';

const TAG_KEY = 'PULSE_DECK';

function platformOf(info: Office.PlatformType | null | undefined): Platform {
  switch (info) {
    case Office.PlatformType.PC:
      return 'PC';
    case Office.PlatformType.Mac:
      return 'Mac';
    case Office.PlatformType.OfficeOnline:
      return 'OfficeOnline';
    case Office.PlatformType.iOS:
      return 'iOS';
    case Office.PlatformType.Android:
      return 'Android';
    case Office.PlatformType.Universal:
      return 'Universal';
    default:
      return 'unknown';
  }
}

function toView(value: unknown): View {
  return value === 'read' ? 'read' : 'edit';
}

/** PowerPoint.run is only used where available and always behind a timeout (§2: verify before relying on it). */
function powerPointAvailable(): boolean {
  return (
    typeof PowerPoint !== 'undefined' &&
    typeof PowerPoint.run === 'function' &&
    Office.context.requirements.isSetSupported('PowerPointApi', '1.3')
  );
}

export function createOfficeHost(info: { platform: Office.PlatformType | null }): OfficeHost {
  const doc = Office.context.document;
  return {
    kind: 'office',
    platform: platformOf(info.platform ?? Office.context.platform),
    displayLanguage: Office.context.displayLanguage || 'de-DE',

    readSettings: () => doc.settings.get(ADDIN_SETTINGS_KEY) as unknown,

    writeSettings: async (value) => {
      try {
        doc.settings.set(ADDIN_SETTINGS_KEY, value);
      } catch {
        return false;
      }
      const ok = await officeCall<unknown>((cb) => {
        doc.settings.saveAsync(cb);
      });
      return ok !== null;
    },

    getView: async () =>
      toView(
        await officeCall<'edit' | 'read'>((cb) => {
          doc.getActiveViewAsync(cb);
        }),
      ),

    onViewChange: (handler) => {
      // Event args: { activeView: 'edit' | 'read', type } (not typed in @types/office-js).
      const listener = (args: unknown): void => {
        handler(toView((args as { activeView?: unknown } | null)?.activeView));
      };
      doc.addHandlerAsync(Office.EventType.ActiveViewChanged, listener);
      return () => {
        doc.removeHandlerAsync(Office.EventType.ActiveViewChanged, { handler: listener });
      };
    },

    getSelectedSlideIds: async () => {
      const range = await officeCall<{ slides?: { id: number }[] }>((cb) => {
        doc.getSelectedDataAsync(Office.CoercionType.SlideRange, cb as (r: Office.AsyncResult<unknown>) => void);
      });
      return range?.slides ? range.slides.map((s) => String(s.id)) : null;
    },

    onSelectionChange: (handler) => {
      const listener = (): void => {
        handler();
      };
      try {
        doc.addHandlerAsync(Office.EventType.DocumentSelectionChanged, listener);
      } catch {
        return () => undefined;
      }
      return () => {
        doc.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: listener });
      };
    },

    openBrowserWindow: (url) => {
      try {
        Office.context.ui.openBrowserWindow(url);
      } catch {
        window.open(url, '_blank', 'noopener');
      }
    },

    readDocumentDeck: async () => {
      if (!powerPointAvailable()) return null;
      const run = PowerPoint.run(async (ctx) => {
        const tag = ctx.presentation.tags.getItemOrNullObject(TAG_KEY);
        tag.load('value');
        await ctx.sync();
        if (tag.isNullObject) return null;
        const parsed = deckLinkSchema.safeParse(JSON.parse(tag.value));
        return parsed.success ? parsed.data : null;
      });
      return withTimeout<DeckLink | null>(run, 4000, null);
    },

    writeDocumentDeck: async (link) => {
      if (!powerPointAvailable()) return false;
      const run = PowerPoint.run(async (ctx) => {
        ctx.presentation.tags.add(TAG_KEY, JSON.stringify(link));
        await ctx.sync();
        return true;
      });
      return withTimeout(run, 4000, false);
    },
  };
}
