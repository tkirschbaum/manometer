import {
  DISPLAY,
  TIMING,
  createTranslator,
  displayHost,
  formatJoinCode,
  formatNumber,
  formatPercent,
  plural,
  type Language,
  type LeaderboardView,
  type QaItemView,
  type ResultsView,
  type SlideItemConfig,
  type Theme,
  type Translate,
} from '@pulse/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ItemLiveState } from '../live/live';
import type { ItemDraft } from '../model/schemas';
import { ArrowUpIcon, CheckIcon, EyeOffIcon, PersonIcon } from '../ui/icons';
import { QrCode } from './QrCode';
import { QuizShape } from './shapes';
import { WordCloud } from './WordCloud';

export interface StageData {
  language: Language;
  theme: Theme;
  showQr: boolean;
  joinCode: string;
  baseUrl: string;
  qaEnabled: boolean;
  config: SlideItemConfig | null;
  draft: ItemDraft | null;
  item: ItemLiveState | null;
  results: ResultsView | null;
  participants: number;
  leaderboard: LeaderboardView | null;
  qa: QaItemView[];
  connected: boolean;
  clockOffset: number;
}

/** Actions are only passed when the stage is interactive (slideshow); preview and offline omit them. */
export interface StageActions {
  hideResponse?: (responseId: string) => void;
  hideWord?: (wordKey: string) => void;
  hideQa?: (qaItemId: string) => void;
  markAnswered?: (qaItemId: string, answered: boolean) => void;
  startQuiz?: () => void;
  reveal?: () => void;
}

function useNow(active: boolean, offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setNow(Date.now() + offset);
    }, 100);
    return () => {
      clearInterval(id);
    };
  }, [active, offset]);
  return now;
}

function promptSize(text: string): string {
  if (text.length <= 60) return 'size-l';
  if (text.length <= 120) return 'size-m';
  return 'size-s';
}

/**
 * Slideshow view of one slide item (§6.7): join strip, prompt, visualisation, footer.
 * Never blank: without server data it still shows join URL, code and QR from the file (principle 4).
 */
export function Stage({ data, actions = {} }: { data: StageData; actions?: StageActions }) {
  const t = useMemo(() => createTranslator(data.language), [data.language]);
  const { config } = data;
  const host = displayHost(data.baseUrl);
  const code = formatJoinCode(data.joinCode);
  const joinUrl = `${data.baseUrl.replace(/\/+$/, '')}/${data.joinCode}`;
  const prompt = config?.kind === 'question' ? config.prompt : data.draft?.kind === 'question' ? data.draft.prompt : '';
  const title =
    config?.kind === 'leaderboard' ? t('stage.leaderboard') : config?.kind === 'qa_wall' ? t('stage.qaTitle') : prompt;

  return (
    <div className={`stage theme-${data.theme}`} lang={data.language}>
      <header className="stage-strip">
        {data.joinCode ? (
          <div className="stage-join">
            {host ? (
              <>
                <span className="stage-join-host">{host}</span>
                <span className="stage-join-sep" aria-hidden="true">
                  ·
                </span>
              </>
            ) : null}
            <span className="stage-join-label">{t('stage.code')}</span>
            <span className="stage-join-code tabular">{code}</span>
          </div>
        ) : (
          <span className="stage-join-label">{t('stage.noSession')}</span>
        )}
        {data.showQr && data.joinCode && data.baseUrl ? (
          <div className="stage-qr">
            <QrCode text={joinUrl} label={`${host} ${code}`} />
          </div>
        ) : null}
      </header>
      <div className="stage-body">
        {title ? <h1 className={`stage-prompt ${promptSize(title)}`}>{title}</h1> : null}
        <div className={`stage-viz ${data.connected ? '' : 'stale'}`}>
          <Visualisation data={data} actions={actions} t={t} />
        </div>
      </div>
      <footer className="stage-footer">
        <span className="stage-count tabular">
          <PersonIcon />
          {footerCount(data, t)}
        </span>
        {!data.connected ? <span className="stage-conn">{t('stage.reconnecting')}</span> : null}
      </footer>
    </div>
  );
}

function footerCount(data: StageData, t: Translate): string {
  if (data.config?.kind === 'leaderboard') return plural(t, 'stage.players', data.leaderboard?.players ?? 0);
  if (data.config?.kind === 'qa_wall') return plural(t, 'stage.questions', data.qa.length);
  const n = data.results?.responses ?? 0;
  return plural(t, 'stage.responses', n, formatNumber(n, data.language));
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="stage-empty">{children}</p>;
}

function Visualisation({ data, actions, t }: { data: StageData; actions: StageActions; t: Translate }) {
  const { config, results } = data;
  const code = formatJoinCode(data.joinCode);
  if (!config) return <Empty>{t('stage.incomplete')}</Empty>;
  if (config.kind === 'leaderboard') return <Leaderboard view={data.leaderboard} t={t} language={data.language} />;
  if (config.kind === 'qa_wall') {
    if (!data.qaEnabled) return <Empty>{t('stage.qaDisabled')}</Empty>;
    return <QaWall items={data.qa} t={t} code={code} actions={actions} />;
  }
  switch (config.type) {
    case 'multiple_choice': {
      const hidden = config.resultsVisibility === 'on_reveal' && !(data.item?.revealed ?? false);
      if (hidden) {
        return (
          <div>
            <Empty>{t('stage.hiddenUntilReveal')}</Empty>
            {actions.reveal ? (
              <button type="button" className="stage-reveal-btn" onClick={actions.reveal}>
                {t('stage.reveal')}
              </button>
            ) : null}
          </div>
        );
      }
      const counts = results?.type === 'multiple_choice' ? results.counts : {};
      const correct = data.item?.revealed && config.correctOptionIds?.length ? new Set(config.correctOptionIds) : null;
      return (
        <Bars
          options={config.options}
          counts={counts}
          total={results?.respondents ?? 0}
          correct={correct}
          language={data.language}
          t={t}
        />
      );
    }
    case 'word_cloud': {
      const words = results?.type === 'word_cloud' ? results.words : [];
      if (words.length === 0) return <Empty>{t('stage.empty', { code })}</Empty>;
      return (
        <WordCloud
          words={words.slice(0, DISPLAY.wordCloudMaxWords)}
          hideLabel={t('stage.hide')}
          {...(actions.hideWord ? { onHide: actions.hideWord } : {})}
        />
      );
    }
    case 'open_text': {
      const entries = results?.type === 'open_text' ? results.entries : [];
      if (entries.length === 0) return <Empty>{t('stage.empty', { code })}</Empty>;
      return <Wall entries={entries} hideLabel={t('stage.hide')} {...(actions.hideResponse ? { onHide: actions.hideResponse } : {})} />;
    }
    case 'scale':
      return <Scale config={config} results={results?.type === 'scale' ? results : null} language={data.language} t={t} />;
    case 'quiz':
      return <Quiz data={data} config={config} actions={actions} t={t} />;
  }
}

// ---------------------------------------------------------------------------------------------

function Bars({
  options,
  counts,
  total,
  correct,
  language,
  t,
  shapes = false,
}: {
  options: { id: string; label: string }[];
  counts: Record<string, number>;
  total: number;
  correct: Set<string> | null;
  language: Language;
  t: Translate;
  shapes?: boolean;
}) {
  return (
    <div className="bars">
      {options.map((o, index) => {
        const n = counts[o.id] ?? 0;
        const pct = total > 0 ? (n / total) * 100 : 0;
        const isCorrect = correct?.has(o.id) ?? false;
        return (
          <div key={o.id} className={`bar-row ${correct && !isCorrect ? 'dim' : ''}`}>
            <span className="bar-label">
              {shapes ? <QuizShape index={index} /> : null}
              {isCorrect ? <CheckIcon aria-label={t('stage.correct')} strokeWidth={3} /> : null}
              <span>{o.label}</span>
            </span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="bar-value tabular">
              {formatNumber(n, language)}
              <span className="pct">{formatPercent(n, total, language)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function textSize(text: string): string {
  if (text.length < 40) return '3.6cqh';
  if (text.length < 120) return '3cqh';
  return '2.6cqh';
}

/** Masonry wall, newest top-left, max 24 visible, gentle scroll of the overflow every 6 s (§6.7). */
function Wall({
  entries,
  hideLabel,
  onHide,
}: {
  entries: { id: string; text: string; at: number }[];
  hideLabel: string;
  onHide?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const visible = [...entries].sort((a, b) => b.at - a.at).slice(0, DISPLAY.openTextMaxVisible);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setColumns(el.clientWidth / el.clientHeight > 2.4 ? 4 : 3);
    });
    observer.observe(el);
    const scroller = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 4) return;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      el.scrollTo({ top: atEnd ? 0 : el.scrollTop + el.clientHeight * 0.8, behavior: 'smooth' });
    }, TIMING.openTextScrollMs);
    return () => {
      observer.disconnect();
      clearInterval(scroller);
    };
  }, []);
  const cols: (typeof visible)[] = Array.from({ length: columns }, () => []);
  visible.forEach((entry, i) => cols[i % columns]?.push(entry));
  return (
    <div ref={ref} style={{ height: '100%', overflow: 'hidden', display: 'flex', gap: '1.6cqw', alignItems: 'flex-start' }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.6cqw' }}>
          {col.map((entry) => (
            <div key={entry.id} className="wall-card hideable" style={{ fontSize: textSize(entry.text) }}>
              {entry.text}
              {onHide ? (
                <button
                  type="button"
                  className="hide-btn"
                  onClick={() => {
                    onHide(entry.id);
                  }}
                >
                  <EyeOffIcon />
                  {hideLabel}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Scale({
  config,
  results,
  language,
  t,
}: {
  config: Extract<SlideItemConfig, { type: 'scale' }>;
  results: Extract<ResultsView, { type: 'scale' }> | null;
  language: Language;
  t: Translate;
}) {
  const values = Array.from({ length: config.range }, (_, i) => i + 1);
  return (
    <div className="scale">
      {config.statements.map((statement) => {
        const row = results?.statements.find((s) => s.id === statement.id);
        const histogram = row?.histogram ?? values.map(() => 0);
        const peak = Math.max(1, ...histogram);
        const average = row?.average ?? null;
        return (
          <div key={statement.id} className="scale-row">
            <span className="scale-label">{statement.label}</span>
            <div className="scale-plot">
              <div className="scale-hist" aria-hidden="true">
                {histogram.map((n, i) => (
                  <div key={i} style={{ height: `${(n / peak) * 100}%` }} />
                ))}
              </div>
              <div className="scale-track tabular">
                {values.map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
              {config.minLabel || config.maxLabel ? (
                <div className="scale-ends">
                  <span>{config.minLabel}</span>
                  <span>{config.maxLabel}</span>
                </div>
              ) : null}
              {average !== null ? (
                <div
                  className="scale-avg-marker"
                  style={{ left: `${((average - 0.5) / config.range) * 100}%` }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <span className="scale-avg tabular">
              <small>{t('stage.averageLabel')}</small>
              {average === null ? '–' : formatNumber(average, language, 1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Quiz({
  data,
  config,
  actions,
  t,
}: {
  data: StageData;
  config: Extract<SlideItemConfig, { type: 'quiz' }>;
  actions: StageActions;
  t: Translate;
}) {
  const state = data.item?.state ?? 'idle';
  const timed = state === 'countdown' || state === 'answering';
  const now = useNow(timed, data.clockOffset);
  const remaining = data.item?.phaseEndsAt ? Math.max(0, data.item.phaseEndsAt - now) : 0;
  const results = data.results?.type === 'quiz' ? data.results : null;

  if (state === 'idle') {
    return (
      <div className="quiz-center">
        {config.startMode === 'click' && actions.startQuiz ? (
          <button type="button" className="quiz-start" onClick={actions.startQuiz}>
            {t('stage.quizStart')}
          </button>
        ) : (
          <QuizOptions config={config} />
        )}
      </div>
    );
  }
  if (state === 'countdown') {
    const n = Math.max(1, Math.ceil(remaining / 1000));
    return (
      <div className="quiz-center" role="timer">
        <span key={n} className="quiz-count tabular">
          {n}
        </span>
        <span className="quiz-hint">{t('stage.quizCountdown')}</span>
      </div>
    );
  }
  if (state === 'answering') {
    const total = config.timeLimitSec * 1000;
    const fraction = total > 0 ? remaining / total : 0;
    const r = 45;
    const circumference = 2 * Math.PI * r;
    return (
      <div className="quiz-grid">
        <QuizOptions config={config} />
        <div className="quiz-timer" role="timer">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--heading)"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - fraction)}
            />
          </svg>
          <span className="quiz-timer-value tabular">{Math.ceil(remaining / 1000)}</span>
        </div>
      </div>
    );
  }
  // reveal (and closed)
  return (
    <Bars
      options={config.options}
      counts={results?.counts ?? {}}
      total={results?.respondents ?? 0}
      correct={new Set([config.correctOptionId])}
      language={data.language}
      t={t}
      shapes
    />
  );
}

function QuizOptions({ config }: { config: Extract<SlideItemConfig, { type: 'quiz' }> }) {
  return (
    <>
      {config.options.map((o, index) => (
        <div key={o.id} className="quiz-option" style={{ gridColumn: (index % 2) + 1 }}>
          <QuizShape index={index} />
          <span>{o.label}</span>
        </div>
      ))}
    </>
  );
}

function Leaderboard({ view, t, language }: { view: LeaderboardView | null; t: Translate; language: Language }) {
  if (!view || view.entries.length === 0) return <Empty>{t('stage.leaderboardEmpty')}</Empty>;
  return (
    <div className="board">
      {view.entries.map((e) => (
        <div key={`${e.rank}-${e.nickname}`} className={`board-row ${e.rank <= 3 ? `top-${e.rank}` : 'rest'}`}>
          <span className="board-rank tabular">{e.rank}</span>
          <span className="board-name">{e.nickname}</span>
          <span className="board-points tabular">{formatNumber(e.points, language)}</span>
        </div>
      ))}
    </div>
  );
}

function QaWall({ items, t, code, actions }: { items: QaItemView[]; t: Translate; code: string; actions: StageActions }) {
  if (items.length === 0) return <Empty>{t('stage.qaEmpty', { code })}</Empty>;
  const open = items.filter((q) => !q.answered).sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt);
  const answered = items.filter((q) => q.answered);
  const shown = [...open, ...answered].slice(0, DISPLAY.qaWallTop);
  return (
    <div className="qa-list">
      {shown.map((q) => (
        <div key={q.id} className={`qa-item hideable ${q.answered ? 'answered' : ''}`}>
          <span className="qa-votes tabular">
            <ArrowUpIcon />
            {q.upvotes}
          </span>
          <span className="qa-text">{q.text}</span>
          {actions.hideQa || actions.markAnswered ? (
            <span style={{ position: 'absolute', top: '0.6cqh', right: '0.6cqw', display: 'flex', gap: '0.6cqw' }}>
              {actions.markAnswered ? (
                <button
                  type="button"
                  className="hide-btn"
                  style={{ position: 'static' }}
                  aria-label={t('qa.answered')}
                  title={t('qa.answered')}
                  onClick={() => actions.markAnswered?.(q.id, !q.answered)}
                >
                  <CheckIcon />
                </button>
              ) : null}
              {actions.hideQa ? (
                <button type="button" className="hide-btn" style={{ position: 'static' }} onClick={() => actions.hideQa?.(q.id)}>
                  <EyeOffIcon />
                  {t('stage.hide')}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
