import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { join, openPresenter, translator } from './helpers';

test.describe('participant flows with the add-in harness as presenter', () => {
  test('multiple choice: join by code entry, vote, presenter sees the result, duplicate prevented', async ({
    page,
    browser,
  }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, {
      type: 'multiple_choice',
      prompt: 'Welches Organ produziert Insulin?',
      options: [
        { id: 'a', label: 'Leber' },
        { id: 'b', label: 'Bauchspeicheldrüse' },
        { id: 'c', label: 'Niere' },
      ],
    });
    await page.goto('/');
    await page.getByLabel(t('join.label')).fill(presenter.code);
    await page.getByRole('button', { name: t('join.submit') }).click();
    await expect(page.getByRole('heading', { name: 'Welches Organ produziert Insulin?' })).toBeVisible();
    await expect(page.getByRole('button', { name: t('session.send') })).toBeDisabled();
    await page.getByRole('radio', { name: 'Bauchspeicheldrüse' }).click();
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await expect(page.getByRole('button', { name: t('session.send') })).toHaveCount(0);
    await expect(presenter.page.locator('.bar-value').nth(1)).toContainText('1');
    await expect(presenter.page.locator('.stage-footer')).toContainText('1');
    // Reload: the answer is remembered (same participant id)
    await page.reload();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await presenter.page.context().close();
  });

  test('word cloud: several entries up to the limit', async ({ page, browser }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, {
      type: 'word_cloud',
      prompt: 'Ein Wort zur Vorlesung',
      wordEntries: 2,
    });
    await join(page, presenter.code);
    const input = page.getByLabel(t('wc.placeholder'));
    await input.fill('Neugier');
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await page.getByRole('button', { name: t('session.sendAnother') }).click();
    await page.getByLabel(t('wc.placeholder')).fill('Praxis');
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.allSent'))).toBeVisible();
    await expect(page.getByRole('button', { name: t('session.sendAnother') })).toHaveCount(0);
    await expect(presenter.page.locator('.cloud-word')).toHaveCount(2, { timeout: 10_000 });
    await presenter.page.context().close();
  });

  test('open text: the answer appears on the wall', async ({ page, browser }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, { type: 'open_text', prompt: 'Was war unklar?' });
    await join(page, presenter.code);
    await page.getByLabel(t('text.placeholder')).fill('Der Unterschied zwischen Typ 1 und Typ 2.');
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await expect(presenter.page.locator('.wall-card')).toContainText('Der Unterschied zwischen Typ 1 und Typ 2.');
    await presenter.page.context().close();
  });

  test('scale: every statement must be rated', async ({ page, browser }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, {
      type: 'scale',
      prompt: 'Wie bewerten Sie die Einheit?',
      statements: [
        { id: 's1', label: 'Verständlichkeit' },
        { id: 's2', label: 'Tempo' },
      ],
    });
    await join(page, presenter.code);
    await page.getByRole('radio', { name: 'Verständlichkeit: 4' }).click();
    await expect(page.getByRole('button', { name: t('session.send') })).toBeDisabled();
    await page.getByRole('radio', { name: 'Tempo: 2' }).click();
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await expect(presenter.page.locator('.scale-avg').first()).toContainText('4');
    await presenter.page.context().close();
  });

  test('quiz: nickname, countdown, answer, result with points and rank', async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const t = translator(info);
    const presenter = await openPresenter(browser, {
      type: 'quiz',
      prompt: 'Normaler Blut-pH-Wert?',
      options: [
        { id: 'a', label: '7,0' },
        { id: 'b', label: '7,4' },
      ],
      quizCorrectOptionId: 'b',
      timeLimitSec: 20,
    });
    await join(page, presenter.code);
    await page.getByLabel(t('quiz.nicknameLabel')).fill('Tester');
    await page.getByRole('button', { name: t('quiz.nicknameSave') }).click();
    await page.getByRole('button', { name: '7,4' }).click({ timeout: 20_000 });
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await expect(page.getByText(t('quiz.correct'))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(t('quiz.rank', { rank: 1, total: 1 }))).toBeVisible();
    await expect(presenter.page.locator('.bar-row').nth(1)).toContainText('1');
    await presenter.page.context().close();
  });

  test('Q&A wall: ask, upvote, presenter sees the question', async ({ page, browser }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, { kind: 'qa_wall' }, { qaEnabled: true });
    await join(page, presenter.code);
    await expect(page.getByRole('tab', { name: t('session.tabQa') })).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel(t('qa.placeholder')).fill('Kommt das zur Prüfung?');
    await page.getByRole('button', { name: t('qa.submit') }).click();
    await expect(page.getByText(t('qa.mine'))).toBeVisible();
    await page.getByRole('button', { name: t('qa.upvote') }).click();
    await expect(page.getByRole('button', { name: t('qa.removeVote') })).toContainText('1');
    await expect(presenter.page.locator('.qa-item')).toContainText('Kommt das zur Prüfung?');
    await expect(presenter.page.locator('.qa-votes')).toContainText('1');
    await presenter.page.context().close();
  });

  test('moving to another slide sends phones to the waiting screen', async ({ page, browser }, info) => {
    const t = translator(info);
    const presenter = await openPresenter(browser, { type: 'multiple_choice', prompt: 'Folie A' });
    await join(page, presenter.code);
    await expect(page.getByRole('heading', { name: 'Folie A' })).toBeVisible();
    await presenter.page.getByTestId('harness-show-other').click();
    await expect(page.getByText(t('session.waiting'))).toBeVisible();
    await presenter.page.getByTestId('harness-show-this').click();
    await expect(page.getByRole('heading', { name: 'Folie A' })).toBeVisible();
    await presenter.page.context().close();
  });

  test('unknown code shows an inline error', async ({ page }, info) => {
    const t = translator(info);
    await page.goto('/000001');
    await expect(page.getByText(t('join.notFound'))).toBeVisible();
  });
});

test.describe('accessibility (axe)', () => {
  test('join, question and quiz screens have no serious or critical violations', async ({ page, browser }, info) => {
    const t = translator(info);
    const check = async (): Promise<void> => {
      // Colour contrast is only meaningful once fade/slide transitions have finished.
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
      );
      const result = await new AxeBuilder({ page }).analyze();
      const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([]);
    };
    await page.goto('/');
    await check();
    const presenter = await openPresenter(browser, { type: 'multiple_choice', prompt: 'Barrierefrei?' });
    await join(page, presenter.code);
    await expect(page.getByRole('heading', { name: 'Barrierefrei?' })).toBeVisible();
    await check();
    await page.getByRole('radio', { name: 'Rot' }).click();
    await page.getByRole('button', { name: t('session.send') }).click();
    await expect(page.getByText(t('session.sent'))).toBeVisible();
    await check();
    await presenter.page.context().close();
    const quiz = await openPresenter(browser, { type: 'quiz', prompt: 'Quiz?', quizCorrectOptionId: 'a' });
    await join(page, quiz.code);
    await expect(page.getByLabel(t('quiz.nicknameLabel'))).toBeVisible();
    await check();
    await page.goto('/datenschutz');
    await check();
    await quiz.page.context().close();
  });
});
