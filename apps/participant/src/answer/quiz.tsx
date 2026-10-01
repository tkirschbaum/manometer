import { LIMITS, type PublicItemView, type QuizResult, type ResponsePayload } from '@pulse/shared';
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

export function NicknamePrompt({ session }: { session: SessionController }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= LIMITS.nicknameMin && name.trim().length <= LIMITS.nicknameMax;
  return (
    <form
      className="mt-6 flex flex-col"
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
      <h2 className="text-[22px] font-bold text-navy">{t('quiz.nicknameTitle')}</h2>
      <label htmlFor="nickname" className="mt-4 text-[16px] font-semibold text-muted">
        {t('quiz.nicknameLabel')}
      </label>
      <input
        id="nickname"
        value={name}
        maxLength={LIMITS.nicknameMax}
        autoComplete="nickname"
        aria-describedby="nickname-hint"
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        className="mt-2 w-full rounded-brand border-2 border-line px-4 py-3 text-[20px] focus:border-navy focus:outline-none"
      />
      <p id="nickname-hint" className="mt-2 text-[15px] text-muted">
        {t('quiz.nicknameHint')}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[16px] font-semibold">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="mt-5 w-full" disabled={!valid || busy}>
        {t('quiz.nicknameSave')}
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
    <div className="fade-in mt-6" role="status">
      <p className="flex items-center gap-3 text-[34px] leading-tight font-bold text-navy">
        {result.correct === true ? <CheckIcon size={34} strokeWidth={3} /> : <CrossIcon size={30} strokeWidth={3} />}
        {headline}
        {result.correct === true ? (
          <span className="tabular">{t('quiz.pointsGained', { points: result.points })}</span>
        ) : null}
      </p>
      {correctLabel && result.correct !== true ? (
        <p className="mt-3 text-[18px]">
          {t('stage.correct')}: <strong>{correctLabel}</strong>
        </p>
      ) : null}
      {result.rank !== null ? (
        <p className="tabular mt-4 text-[22px] font-semibold">
          {t('quiz.rank', { rank: result.rank, total: result.rankOf })}
        </p>
      ) : null}
      <p className="tabular mt-1 text-[17px] text-muted">{t('quiz.totalPoints', { points: result.totalPoints })}</p>
    </div>
  );
}

export function QuizView({
  item,
  session,
  nickname,
  answered,
  queued,
  result,
  onAnswer,
}: {
  item: PublicItemView;
  session: SessionController;
  nickname: string | null;
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

  if (!nickname && item.state !== 'reveal') {
    return <NicknamePrompt session={session} />;
  }
  if (item.state === 'idle') {
    return <p className="mt-6 text-[20px] text-ink">{t('quiz.startsSoon')}</p>;
  }
  if (item.state === 'countdown') {
    return (
      <div className="mt-6 flex flex-col items-center text-center" role="timer" aria-live="assertive">
        <p className="text-[20px] text-muted">{t('quiz.getReady')}</p>
        <p className="tabular mt-2 text-[96px] leading-none font-bold text-navy">{Math.max(1, seconds)}</p>
      </div>
    );
  }
  if (item.state === 'reveal') return <ResultCard result={result} item={item} />;

  // answering
  if (answered) {
    const label = answered.type === 'quiz' ? item.options.find((o) => o.id === answered.optionId)?.label : null;
    return (
      <div className="mt-6" role="status">
        <p className="flex items-center gap-2 text-[22px] font-bold text-navy">
          <CheckIcon size={24} strokeWidth={3} />
          {t('session.sent')}
        </p>
        {label ? <p className="mt-2 text-[18px]">{label}</p> : null}
        <p className="mt-4 text-[17px] text-muted">{queued ? t('session.queued') : t('quiz.waitReveal')}</p>
      </div>
    );
  }
  const expired = remainingMs <= 0;
  return (
    <div className="mt-2 flex flex-col">
      <p className="tabular text-[17px] font-semibold text-muted" role="timer">
        {expired ? t('quiz.timeUp') : t('quiz.secondsLeft', { s: seconds })}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        {item.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            disabled={expired}
            onClick={() => {
              onAnswer({ type: 'quiz', optionId: option.id });
            }}
            className="flex min-h-16 items-center gap-3 rounded-brand border-2 border-line bg-paper px-4 py-3 text-left text-[18px] font-semibold text-ink hover:border-navy disabled:opacity-40"
          >
            <QuizShapeIcon index={index} />
            <span className="min-w-0 break-words">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
