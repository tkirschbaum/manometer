import type { LeaderboardView, ParticipantDeckState, PresenterDeckState, QuizResult } from '@pulse/shared';
import { newUuid } from '@pulse/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ManualClock,
  call,
  connectParticipant,
  connectPresenter,
  newDeck,
  next,
  quizConfig,
  startServer,
  type TestServer,
} from './helpers';

const clock = new ManualClock();
let server: TestServer;

beforeAll(async () => {
  server = await startServer({ now: clock.now, scheduler: clock });
});

afterAll(async () => {
  await server.stop();
});

describe('quiz engine', () => {
  it('runs countdown → answering → reveal with server timing, scoring, TOO_LATE and leaderboard', async () => {
    const { deckId, deckSecret } = newDeck();
    const presenter = await connectPresenter(server.url, deckId, deckSecret);
    const deck = await next<PresenterDeckState>(presenter, 'deck:state');

    const [anna, ben, cleo] = await Promise.all([1, 2, 3].map(() => connectParticipant(server.url, deck.joinCode)));
    if (!anna || !ben || !cleo) throw new Error('connect');
    // Nickname is required before the first quiz answer; collisions get " 2".
    expect(await call(anna, 'nickname:set', { nickname: 'Anna' })).toEqual({ ok: true, nickname: 'Anna' });
    expect(await call(ben, 'nickname:set', { nickname: 'anna' })).toEqual({ ok: true, nickname: 'anna 2' });

    const quiz = quizConfig(deckId);
    const snap = await call<{ state: string; phaseEndsAt: number }>(presenter, 'item:activate', {
      itemId: quiz.id,
      config: quiz,
    });
    expect(snap.ok && snap.state).toBe('countdown');
    const start = clock.now();
    if (snap.ok) expect(snap.phaseEndsAt).toBe(start + 3000);

    const answering = next<ParticipantDeckState>(anna, 'deck:state', (s) => s.activeItem?.state === 'answering');
    // Answer during countdown -> not active yet
    expect(
      await call(anna, 'response:submit', {
        itemId: quiz.id,
        clientResponseId: newUuid(),
        payload: { type: 'quiz', optionId: 'w' },
      }),
    ).toEqual({ ok: false, error: 'NOT_ACTIVE' });
    await clock.advance(3000);
    const live = await answering;
    expect(live.activeItem?.phaseEndsAt).toBe(start + 3000 + 20_000);
    expect(live.activeItem?.correctOptionIds).toBeNull();
    expect(JSON.stringify(live)).not.toContain('correctOptionId"');

    // Cleo has no nickname
    expect(
      await call(cleo, 'response:submit', {
        itemId: quiz.id,
        clientResponseId: newUuid(),
        payload: { type: 'quiz', optionId: 'w' },
      }),
    ).toEqual({ ok: false, error: 'NICKNAME_REQUIRED' });

    await clock.advance(2000);
    const a = await call(anna, 'response:submit', {
      itemId: quiz.id,
      clientResponseId: newUuid(),
      payload: { type: 'quiz', optionId: 'w' },
    });
    expect(a.ok).toBe(true);
    await call(cleo, 'nickname:set', { nickname: 'Cleo' });
    await clock.advance(10_000);
    expect(
      (
        await call(cleo, 'response:submit', {
          itemId: quiz.id,
          clientResponseId: newUuid(),
          payload: { type: 'quiz', optionId: 'g' },
        })
      ).ok,
    ).toBe(true);
    // Within the 300 ms grace after the end -> accepted
    await clock.advance(8000 + 200);
    expect(
      (
        await call(ben, 'response:submit', {
          itemId: quiz.id,
          clientResponseId: newUuid(),
          payload: { type: 'quiz', optionId: 'w' },
        })
      ).ok,
    ).toBe(true);

    const annaResult = next<QuizResult>(anna, 'quiz:result');
    const cleoResult = next<QuizResult>(cleo, 'quiz:result');
    const board = next<LeaderboardView>(presenter, 'leaderboard:update', (l) => l.players === 3);
    await clock.advance(101);

    // After reveal -> TOO_LATE
    const extra = await connectParticipant(server.url, deck.joinCode);
    await call(extra, 'nickname:set', { nickname: 'Dora' });
    expect(
      await call(extra, 'response:submit', {
        itemId: quiz.id,
        clientResponseId: newUuid(),
        payload: { type: 'quiz', optionId: 'w' },
      }),
    ).toEqual({ ok: false, error: 'TOO_LATE' });

    const ra = await annaResult;
    expect(ra).toMatchObject({ correct: true, points: 950, totalPoints: 950, rank: 1, rankOf: 3 });
    const rc = await cleoResult;
    expect(rc).toMatchObject({ correct: false, points: 0, rank: 3 });
    const leaderboard = await board;
    expect(leaderboard.entries.map((e) => [e.nickname, e.points])).toEqual([
      ['Anna', 950],
      ['anna 2', 500],
      ['Cleo', 0],
    ]);
    expect(leaderboard.quizCount).toBe(1);

    // Participant sees the correct answer after reveal
    const view = await call<{ mine: { quizResult: QuizResult } }>(anna, 'item:mine', { itemId: quiz.id });
    expect(view.ok && view.mine.quizResult.points).toBe(950);

    for (const s of [anna, ben, cleo, extra]) s.close();
    presenter.close();
  });

  it('rejects late answers by time even before the reveal timer fired', async () => {
    const { deckId, deckSecret } = newDeck();
    const presenter = await connectPresenter(server.url, deckId, deckSecret);
    const deck = await next<PresenterDeckState>(presenter, 'deck:state');
    const p = await connectParticipant(server.url, deck.joinCode);
    await call(p, 'nickname:set', { nickname: 'Eva' });
    const quiz = quizConfig(deckId, { startMode: 'click', timeLimitSec: 10 });
    const snap = await call<{ state: string }>(presenter, 'item:activate', { itemId: quiz.id, config: quiz });
    expect(snap.ok && snap.state).toBe('idle');
    await call(presenter, 'item:reveal', { itemId: quiz.id }); // manual start
    await clock.advance(3000);
    clock.current += 10_000 + 301; // time passes, timer not yet run
    expect(
      await call(p, 'response:submit', {
        itemId: quiz.id,
        clientResponseId: newUuid(),
        payload: { type: 'quiz', optionId: 'w' },
      }),
    ).toEqual({ ok: false, error: 'TOO_LATE' });
    await clock.advance(10);
    p.close();
    presenter.close();
  });

  it('anonymous quiz names: phones get an automatic name and can answer without typing one', async () => {
    const { deckId, deckSecret } = newDeck();
    const presenter = await connectPresenter(server.url, deckId, deckSecret);
    const deck = await next<PresenterDeckState>(presenter, 'deck:state');
    await call(presenter, 'deck:upsert', { settings: { ...deck.settings, quizNames: 'anonymous' } });
    const quiz = quizConfig(deckId);
    await call(presenter, 'item:upsert', quiz);

    const p = await connectParticipant(server.url, deck.joinCode);
    const me = await next<{ nickname: string | null }>(p, 'me', (m) => m.nickname !== null);
    expect(me.nickname).toMatch(/^\p{L}+ \d{1,3}$/u);
    const state = await next<ParticipantDeckState>(p, 'deck:state');
    expect(state.deck).toMatchObject({ hasQuiz: true, quizNames: 'anonymous' });

    await call(presenter, 'item:activate', { itemId: quiz.id, config: quiz });
    await clock.advance(3000);
    const answer = await call(p, 'response:submit', {
      itemId: quiz.id,
      clientResponseId: newUuid(),
      payload: { type: 'quiz', optionId: 'w' },
    });
    expect(answer.ok).toBe(true);
    p.close();
    presenter.close();
  });

  it('names asked: phones learn on join that a name is needed, answers without one are refused', async () => {
    const { deckId, deckSecret } = newDeck();
    const presenter = await connectPresenter(server.url, deckId, deckSecret);
    const deck = await next<PresenterDeckState>(presenter, 'deck:state');
    const p = await connectParticipant(server.url, deck.joinCode);
    expect((await next<ParticipantDeckState>(p, 'deck:state')).deck).toMatchObject({
      hasQuiz: false,
      quizNames: 'ask',
    });
    // Adding the first quiz tells phones that joined earlier.
    const quiz = quizConfig(deckId);
    const told = next<ParticipantDeckState>(p, 'deck:state', (s) => s.deck.hasQuiz);
    await call(presenter, 'item:upsert', quiz);
    expect((await told).deck.quizNames).toBe('ask');
    await call(presenter, 'item:activate', { itemId: quiz.id, config: quiz });
    await clock.advance(3000);
    expect(
      await call(p, 'response:submit', {
        itemId: quiz.id,
        clientResponseId: newUuid(),
        payload: { type: 'quiz', optionId: 'w' },
      }),
    ).toEqual({ ok: false, error: 'NICKNAME_REQUIRED' });
    p.close();
    presenter.close();
  });
});
