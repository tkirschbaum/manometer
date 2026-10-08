import {
  LIMITS,
  QUIZ_COLORS,
  QUIZ_TEXT_COLORS,
  type PublicItemView,
  type QuizResult,
  type ResponsePayload,
} from '@pulse/shared';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { QuizShapeIcon } from '../components/QuizShape';
import { CheckIcon, CrossIcon } from '../components/icons';
import { useI18n } from '../lib/i18n';
import type { SessionController } from '../lib/session';

/** Re-renders every 200 ms while active (countdown and timer display). */
function useTicker(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
    }, 200);
    return () => {
      clearInterval(id);
    };
  }, [active]);
}

/**
 * Name entry. Used right after joining when the presenter asks for names (deck setting "quizNames": "ask"), and as
 * a fallback inside a quiz question for anyone who has no name yet.
 */
export function NicknamePrompt({ session, intro = false }: { session: SessionController; intro?: boolean }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= LIMITS.nicknameMin && name.trim().length <= LIMITS.nicknameMax;
  return (
    <form
      className={`rise-in flex flex-col ${intro ? 'mt-8 flex-1' : 'mt-2'}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        void session.setNickname(name.trim()).then((res) => {
          setBusy(false);
          if (!res.ok) setError(t(`error.${res.error}`));
        });
      }}
    >
      <h2 className={`font-extrabold tracking-tight text-ink ${intro ? 'text-[28px] leading-tight' : 'text-[22px]'}`}>
        {intro ? t('join.nameTitle') : t('quiz.nicknameTitle')}
      </h2>
      <label htmlFor="nickname" className="mt-5 text-[16px] font-semibold text-muted">
        {t('quiz.nicknameLabel')}
      </label>
      <input
        id="nickname"
        value={name}
        maxLength={LIMITS.nicknameMax}
        autoComplete="nickname"
        enterKeyHint="go"
        aria-describedby="nickname-hint"
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        className="mt-2 w-full rounded-brand border-2 border-transparent bg-mist px-4 py-3.5 text-[20px] font-semibold transition-colors focus:border-primary focus:bg-paper focus:outline-none"
      />
      <p id="nickname-hint" className="mt-2 text-[15px] text-muted">
        {intro ? t('join.nameHint') : t('quiz.nicknameHint')}
      </p>
      {error ? (
        <p role="alert" className="mt-2 flex items-start gap-2 text-[16px] font-semibold">
          <CrossIcon size={18} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {intro ? <div className="flex-1" /> : null}
      <Button type="submit" className="mt-6 w-full" disabled={!valid || busy}>
        {intro ? t('join.nameSubmit') : t('quiz.nicknameSave')}
      </Button>
    </form>
  );
}

function ResultCard({ result, item }: { result: QuizResult | null; item: PublicItemView }) {
  const { t } = useI18n();
  const correctLabel = item.options.find((o) => item.correctOptionIds?.includes(o.id))?.label;
  if (!result) return <p className="mt-6 text-[18px] text-muted">{t('quiz.waitReveal')}</p>;
  const headline =
    result.correct === true ? t('quiz.correct') : result.correct === false ? t('quiz.wrong') : t('quiz.noAnswer');
  return (
    <div
      className={`rise-in mt-4 rounded-[24px] px-5 py-6 ${result.correct === true ? 'bg-[#e3f6ef]' : 'bg-[#fdeceb]'}`}
      role="status"
    >
      <div className="flex items-center gap-4">
        <span
          className={`pop flex size-14 shrink-0 items-center justify-center rounded-full text-paper ${result.correct === true ? 'bg-ok' : 'bg-coral'}`}
        >
          {result.correct === true ? <CheckIcon size={30} strokeWidth={3} /> : <CrossIcon size={26} strokeWidth={3} />}
        </span>
        <p className="text-[30px] leading-tight font-extrabold text-ink">{headline}</p>
        {result.correct === true ? (
          <span className="tabular ml-auto rounded-full bg-paper px-3 py-1 text-[20px] font-extrabold text-ok">
            {t('quiz.pointsGained', { points: result.points })}
          </span>
        ) : null}
      </div>
      {correctLabel && result.correct !== true ? (
        <p className="mt-4 text-[18px]">
          {t('stage.correct')}: <strong>{correctLabel}</strong>
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {result.rank !== null ? (
          <p className="tabular text-[22px] font-extrabold text-ink">
            {t('quiz.rank', { rank: result.rank, total: result.rankOf })}
          </p>
        ) : null}
        <p className="tabular text-[17px] font-semibold text-muted">
          {t('quiz.totalPoints', { points: result.totalPoints })}
        </p>
      </div>
    </div>
  );
}

/** Small chip with the player's name (anonymous names are assigned by the server). */
function PlayingAs({ nickname, anonymous }: { nickname: string | null; anonymous: boolean }) {
  const { t } = useI18n();
  if (!nickname) return null;
  return (
    <p className="mb-3 inline-flex max-w-full self-start truncate rounded-full bg-mist px-3 py-1 text-[15px] font-semibold text-muted">
      {anonymous ? t('quiz.playingAsAnon', { name: nickname }) : t('quiz.playingAs', { name: nickname })}
    </p>
  );
}

export function QuizView({
  item,
  session,
  nickname,
  anonymous,
  answered,
  queued,
  result,
  onAnswer,
}: {
  item: PublicItemView;
  session: SessionController;
  nickname: string | null;
  /** Deck plays without names: the server assigns one on the first answer. */
  anonymous: boolean;
  answered: ResponsePayload | null;
  queued: boolean;
  result: QuizResult | null;
  onAnswer: (payload: ResponsePayload) => void;
}) {
  const { t } = useI18n();
  const timed = item.state === 'countdown' || item.state === 'answering';
  useTicker(timed);
  const remainingMs = item.phaseEndsAt !== null ? Math.max(0, item.phaseEndsAt - session.clock.now()) : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  if (!nickname && !anonymous && item.state !== 'reveal') {
    return <NicknamePrompt session={session} />;
  }
  if (item.state === 'idle') {
    return (
      <div className="flex flex-col">
        <PlayingAs nickname={nickname} anonymous={anonymous} />
        <p className="mt-4 text-[20px] font-semibold text-ink">{t('quiz.startsSoon')}</p>
      </div>
    );
  }
  if (item.state === 'countdown') {
    return (
      <div className="mt-6 flex flex-col items-center text-center" role="timer" aria-live="assertive">
        <p className="text-[20px] font-semibold text-muted">{t('quiz.getReady')}</p>
        <p
          key={seconds}
          className="pop tabular mt-5 flex size-36 items-center justify-center rounded-full bg-primary text-[80px] leading-none font-extrabold text-paper"
        >
          {Math.max(1, seconds)}
        </p>
      </div>
    );
  }
  if (item.state === 'reveal') return <ResultCard result={result} item={item} />;

  // answering
  if (answered) {
    const index = answered.type === 'quiz' ? item.options.findIndex((o) => o.id === answered.optionId) : -1;
    const option = item.options[index];
    return (
      <div className="rise-in mt-2 flex flex-col" role="status">
        <p className="flex items-center gap-3 text-[24px] font-extrabold text-ink">
          <span className="pop flex size-10 items-center justify-center rounded-full bg-ok text-paper">
            <CheckIcon size={22} strokeWidth={3} />
          </span>
          {t('session.sent')}
        </p>
        {option ? (
          <p
            className="mt-4 flex items-center gap-3 rounded-brand px-4 py-3 text-[18px] font-bold"
            style={{
              background: QUIZ_COLORS[index % QUIZ_COLORS.length],
              color: QUIZ_TEXT_COLORS[index % QUIZ_TEXT_COLORS.length],
            }}
          >
            <QuizShapeIcon index={index} size={24} color="currentColor" />
            <span className="min-w-0 break-words">{option.label}</span>
          </p>
        ) : null}
        <p className="mt-4 text-[17px] text-muted">{queued ? t('session.queued') : t('quiz.waitReveal')}</p>
      </div>
    );
  }
  const expired = remainingMs <= 0;
  const total = item.timeLimitSec ? item.timeLimitSec * 1000 : 0;
  return (
    <div className="flex flex-col">
      <PlayingAs nickname={nickname} anonymous={anonymous} />
      <div className="flex items-center gap-3" role="timer">
        <span className="tabular text-[17px] font-bold text-ink">
          {expired ? t('quiz.timeUp') : t('quiz.secondsLeft', { s: seconds })}
        </span>
        {total > 0 ? (
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-mist" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
              style={{ width: `${Math.min(100, (remainingMs / total) * 100)}%` }}
            />
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {item.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            disabled={expired}
            onClick={() => {
              onAnswer({ type: 'quiz', optionId: option.id });
            }}
            style={{
              background: QUIZ_COLORS[index % QUIZ_COLORS.length],
              color: QUIZ_TEXT_COLORS[index % QUIZ_TEXT_COLORS.length],
            }}
            className="flex min-h-20 items-center gap-3 rounded-brand px-4 py-3 text-left text-[19px] font-bold shadow-[inset_0_-5px_0_rgb(0_0_0/0.14)] transition-transform active:scale-[0.97] disabled:opacity-40"
          >
            <QuizShapeIcon index={index} size={30} color="currentColor" />
            <span className="min-w-0 break-words">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
