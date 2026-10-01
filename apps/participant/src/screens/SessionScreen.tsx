import type { PublicItemView, ResponsePayload } from '@pulse/shared';
import { useState } from 'react';
import { MultipleChoiceInput, OpenTextInput, ScaleInput, WordCloudInput, describeAnswer } from '../answer/inputs';
import { QuizView } from '../answer/quiz';
import { PhoneResults } from '../answer/results';
import { Button } from '../components/Button';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Shell } from '../components/Shell';
import { CheckIcon, CrossIcon } from '../components/icons';
import { useI18n } from '../lib/i18n';
import { getParticipantId } from '../lib/participantId';
import { pendingFor, useSession, type SessionController, type SessionState } from '../lib/session';
import { JoinScreen } from './JoinScreen';
import { QaTab } from './QaTab';

type Tab = 'live' | 'qa';

export function SessionScreen({ code }: { code: string }) {
  const [participantId] = useState(() => getParticipantId());
  const { state, session } = useSession(code, participantId);
  const { t } = useI18n();
  const activeId = state.activeItem?.id ?? null;
  const qaEnabled = state.deck?.qaEnabled ?? false;
  // A tab picked by hand holds until the active item changes; otherwise the Q&A wall slide
  // foregrounds the Q&A tab (§4.2) and everything else shows the live tab.
  const [picked, setPicked] = useState<{ tab: Tab; itemId: string | null } | null>(null);
  const tab: Tab =
    picked?.itemId === activeId ? picked.tab : state.activeItem?.kind === 'qa_wall' && qaEnabled ? 'qa' : 'live';
  const setTab = (next: Tab): void => {
    setPicked({ tab: next, itemId: activeId });
  };

  if (state.status === 'notFound') return <JoinScreen initialCode={code} notFound />;

  const banner = state.status === 'reconnecting' ? <ConnectionBanner /> : null;
  return (
    <Shell banner={banner} title={state.deck?.title}>
      {qaEnabled ? <Tabs tab={tab} onChange={setTab} /> : null}
      {!state.deck ? (
        <p className="mt-10 text-[18px] text-muted" role="status">
          {t('session.connecting')}
        </p>
      ) : tab === 'qa' && qaEnabled ? (
        <QaTab state={state} session={session} />
      ) : (
        <LiveView state={state} session={session} onOpenQa={() => {
          setTab('qa');
        }} />
      )}
    </Shell>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useI18n();
  return (
    <div role="tablist" className="mb-2 grid grid-cols-2 border-b border-line">
      {(['live', 'qa'] as const).map((id) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={tab === id}
          onClick={() => {
            onChange(id);
          }}
          className={`min-h-12 border-b-[3px] text-[17px] font-semibold ${tab === id ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-navy'}`}
        >
          {id === 'live' ? t('session.tabLive') : t('session.tabQa')}
        </button>
      ))}
    </div>
  );
}

function Waiting() {
  const { t } = useI18n();
  return (
    <div className="mt-12 flex items-center gap-3" role="status">
      <span className="breathing inline-block size-3 rounded-full bg-navy" aria-hidden="true" />
      <p className="text-[20px] text-ink">{t('session.waiting')}</p>
    </div>
  );
}

function LiveView({ state, session, onOpenQa }: { state: SessionState; session: SessionController; onOpenQa: () => void }) {
  const { t } = useI18n();
  const item = state.activeItem;
  if (!item) return <Waiting />;
  if (item.kind === 'leaderboard') {
    const last = state.lastQuizResult;
    return (
      <div className="mt-10">
        <p className="text-[20px]">{t('session.leaderboard')}</p>
        {last && last.rank !== null ? (
          <p className="tabular mt-4 text-[24px] font-bold text-navy">{t('quiz.rank', { rank: last.rank, total: last.rankOf })}</p>
        ) : null}
      </div>
    );
  }
  if (item.kind === 'qa_wall') {
    return (
      <div className="mt-10">
        <p className="text-[20px]">{state.deck?.qaEnabled ? t('session.qaWall') : t('qa.disabled')}</p>
        {state.deck?.qaEnabled ? (
          <Button variant="secondary" className="mt-6" onClick={onOpenQa}>
            {t('session.openQa')}
          </Button>
        ) : null}
      </div>
    );
  }
  return <QuestionView key={item.id} item={item} state={state} session={session} />;
}

function QuestionView({ item, state, session }: { item: PublicItemView; state: SessionState; session: SessionController }) {
  const { t } = useI18n();
  const [composing, setComposing] = useState(false);
  const mine = state.mine?.itemId === item.id ? state.mine.submissions : [];
  const queued = pendingFor(state, item.id);
  const all = [...mine, ...queued];
  const limit = item.type === 'word_cloud' || item.type === 'open_text' ? item.entriesPerParticipant : 1;
  const done = all.length >= limit;
  const closed = item.state === 'closed';
  const submit = (payload: ResponsePayload): void => {
    session.submit(payload);
    setComposing(false);
  };
  const error = state.error ? (
    <p role="alert" className="mt-4 flex items-start gap-2 text-[17px] font-semibold">
      <CrossIcon size={20} className="mt-0.5 shrink-0" />
      {t(`error.${state.error}`)}
    </p>
  ) : null;

  const showResults =
    state.results !== null && item.showOnPhone && (all.length > 0 || closed) && (item.state !== 'open' || mine.length > 0);

  return (
    <article className="mt-4 flex flex-1 flex-col">
      <h1 className="text-[26px] leading-snug font-bold break-words text-navy">{item.prompt}</h1>
      <div className="mt-5 flex flex-1 flex-col">
        {item.type === 'quiz' ? (
          <QuizView
            item={item}
            session={session}
            nickname={state.nickname}
            answered={all[0] ?? null}
            queued={queued.length > 0}
            result={state.quizResult}
            onAnswer={submit}
          />
        ) : closed || (all.length > 0 && !composing) || done ? (
          <Sent item={item} answers={all} queued={queued.length > 0} closed={closed}>
            {!closed && !done ? (
              <Button
                variant="secondary"
                className="mt-6 w-full"
                onClick={() => {
                  session.clearError();
                  setComposing(true);
                }}
              >
                {t('session.sendAnother')}
              </Button>
            ) : null}
          </Sent>
        ) : item.type === 'multiple_choice' ? (
          <MultipleChoiceInput item={item} onSubmit={submit} />
        ) : item.type === 'word_cloud' ? (
          <WordCloudInput item={item} onSubmit={submit} used={all.length} />
        ) : item.type === 'open_text' ? (
          <OpenTextInput item={item} onSubmit={submit} />
        ) : item.type === 'scale' ? (
          <ScaleInput item={item} onSubmit={submit} />
        ) : null}
        {error}
        {showResults && state.results ? <PhoneResults item={item} results={state.results} /> : null}
      </div>
    </article>
  );
}

function Sent({
  item,
  answers,
  queued,
  closed,
  children,
}: {
  item: PublicItemView;
  answers: ResponsePayload[];
  queued: boolean;
  closed: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const multiple = item.type === 'word_cloud' || item.type === 'open_text';
  const remaining = item.entriesPerParticipant - answers.length;
  return (
    <div role="status" className="flex flex-col">
      {closed ? (
        <p className="text-[22px] font-bold text-navy">{t('session.closed')}</p>
      ) : (
        <p className="flex items-center gap-2 text-[22px] font-bold text-navy">
          <CheckIcon size={24} strokeWidth={3} />
          {t('session.sent')}
        </p>
      )}
      {queued ? <p className="mt-2 text-[16px] text-muted">{t('session.queued')}</p> : null}
      {answers.length > 0 ? (
        <>
          {multiple ? <h2 className="mt-5 text-[15px] font-semibold text-muted">{t('session.answersSent')}</h2> : null}
          <ul className="mt-2 flex flex-col gap-2">
            {answers.map((a, i) => (
              <li key={i} className="fade-in rounded-brand bg-mist px-4 py-3 text-[18px] break-words">
                {describeAnswer(item, a)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {multiple && !closed && remaining <= 0 ? <p className="mt-4 text-[16px] text-muted">{t('session.allSent')}</p> : null}
      {children}
    </div>
  );
}
