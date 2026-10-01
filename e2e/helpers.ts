import { randomBytes, randomUUID } from 'node:crypto';
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { dictionaries, type MessageKey } from '../packages/shared/src/index';

export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Translator for the project's locale, so assertions work in DE and EN. */
export function translator(info: TestInfo): T {
  const locale = String(info.project.use.locale ?? 'de');
  const dict = dictionaries[locale.startsWith('de') ? 'de' : 'en'];
  return (key, vars) => dict[key].replace(/\{(\w+)\}/g, (m, name: string) => String(vars?.[name] ?? m));
}

interface DraftOverrides {
  kind?: 'question' | 'leaderboard' | 'qa_wall';
  type?: 'multiple_choice' | 'word_cloud' | 'open_text' | 'scale' | 'quiz';
  prompt?: string;
  options?: { id: string; label: string }[];
  statements?: { id: string; label: string }[];
  wordEntries?: number;
  textEntries?: number;
  quizCorrectOptionId?: string | null;
  timeLimitSec?: 10 | 15 | 20 | 30 | 45 | 60;
  showOnPhone?: boolean;
  allowMultiple?: boolean;
}

export interface Presenter {
  page: Page;
  code: string;
  instance: string;
}

/**
 * Opens the add-in harness as presenter, seeded with one slide item, in slideshow view on its own slide:
 * the item activates by itself, exactly like a Pulse slide appearing in PowerPoint (§6.6).
 */
export async function openPresenter(
  browser: Browser,
  draft: DraftOverrides,
  deckSettings: Partial<{ title: string; qaEnabled: boolean; slideLanguage: 'de' | 'en' }> = {},
): Promise<Presenter> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'de-AT' });
  const page = await context.newPage();
  await page.route('https://appsforoffice.microsoft.com/**', (route) => route.abort());
  const instance = `e2e-${randomUUID().slice(0, 8)}`;
  const settings = {
    v: 1,
    deck: {
      id: randomUUID(),
      secret: randomBytes(32).toString('base64url'),
      joinCode: '',
      settings: { title: 'E2E', slideLanguage: 'de', theme: 'light', qaEnabled: false, showQr: true, ...deckSettings },
      baseUrl: '',
    },
    item: {
      id: randomUUID(),
      kind: 'question',
      type: 'multiple_choice',
      prompt: 'Frage',
      resultsVisibility: 'live',
      showOnPhone: false,
      options: [
        { id: 'a', label: 'Rot' },
        { id: 'b', label: 'Blau' },
      ],
      allowMultiple: false,
      maxSelections: null,
      correctOptionIds: [],
      wordEntries: 3,
      textEntries: 1,
      statements: [{ id: 's1', label: 'Aussage' }],
      range: 5,
      minLabel: '',
      maxLabel: '',
      quizCorrectOptionId: null,
      timeLimitSec: 20,
      startMode: 'auto',
      ...draft,
    },
    boundSlideId: '256',
    lastSyncedHash: null,
  };
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [`pulse.harness.settings.${instance}`, JSON.stringify(settings)] as const,
  );
  await page.goto(`/addin/?harness=1&instance=${instance}&slide=256&view=read`, { waitUntil: 'domcontentloaded' });
  const codeEl = page.locator('.stage-join-code');
  await expect(codeEl).toHaveText(/\d{3} \d{3}/, { timeout: 15_000 });
  const code = (await codeEl.innerText()).replace(/\D/g, '');
  return { page, code, instance };
}

export async function join(page: Page, code: string): Promise<void> {
  await page.goto(`/${code}`, { waitUntil: 'domcontentloaded' });
}
