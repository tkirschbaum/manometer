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

interface Join {
  host: string;
  code: string;
  url: string;
  showQr: boolean;
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
  if (text.length <= 50) return 'size-l';
  if (text.length <= 110) return 'size-m';
  return 'size-s';
}

/**
 * Slideshow view of one slide item (§6.7): slim join strip, prompt, visualisation, small footer.
 * Never blank: without server data it still shows join URL, code and QR from the file (principle 4).
 * `joinOverlay` (slideshow only): clicking the join strip shows the QR code and code full size.
 */
export function Stage({
  data,
  actions = {},
  joinOverlay = false,
}: {
  data: StageData;
  actions?: StageActions;
  joinOverlay?: boolean;
}) {
  const t = useMemo(() => createTranslator(data.language), [data.language]);
  const [overlay, setOverlay] = useState(false);
  const { config } = data;
  const join: Join = {
    host: displayHost(data.baseUrl),
    code: formatJoinCode(data.joinCode),
    url: `${data.baseUrl.replace(/\/+$/, '')}/${data.joinCode}`,
    showQr: data.showQr && data.joinCode !== '' && data.baseUrl !== '',
  };
  const prompt = config?.kind === 'question' ? config.prompt : data.draft?.kind === 'question' ? data.draft.prompt : '';
  const title =
    config?.kind === 'leaderboard' ? t('stage.leaderboard') : config?.kind === 'qa_wall' ? t('stage.qaTitle') : prompt;

  const strip = data.joinCode ? (
    <>
      {/* Only the six digits on the slide; the address is in the QR code and in the full-screen join view. */}
      <span className="stage-join">
        <span className="sr-only">{t('stage.code')} </span>
        <span className="stage-join-code tabular">{join.code}</span>
      </span>
      {join.showQr ? (
        <span className="stage-qr">
          <QrCode text={join.url} label={`${join.host} ${join.code}`} />
        </span>
      ) : null}
    </>
  ) : (
    <span className="stage-join-label">{t('stage.noSession')}</span>
  );

  return (
    <div className={`stage theme-${data.theme}`} lang={data.language}>
      {joinOverlay && data.joinCode ? (
        <button
          type="button"
          className="stage-strip interactive"
          aria-label={t('stage.showJoin')}
          onClick={() => {
            setOverlay(true);
          }}
        >
          {strip}
        </button>
      ) : (
        <header className="stage-strip">{strip}</header>
      )}
      <div className="stage-body">
        {title ? <h1 className={`stage-prompt ${promptSize(title)}`}>{title}</h1> : null}
        <div className={`stage-viz ${data.connected ? '' : 'stale'}`}>
          <Visualisation data={data} actions={actions} t={t} join={join} />
        </div>
      </div>
      <footer className="stage-footer">
        <span className="stage-count tabular">
          <PersonIcon />
          {footerCount(data, t)}
        </span>
        {!data.connected ? <span className="stage-conn">{t('stage.reconnecting')}</span> : null}
      </footer>
      {overlay ? (
        <button
          type="button"
          className="stage-overlay"
          aria-label={t('common.close')}
          onClick={() => {
            setOverlay(false);
          }}
        >
          {join.showQr ? (
            <span className="stage-overlay-qr">
              <QrCode text={join.url} label={`${join.host} ${join.code}`} />
            </span>
          ) : null}
          <span className="stage-overlay-text">
            {join.host ? <span className="stage-overlay-host">{join.host}</span> : null}
            <span className="stage-overlay-code tabular">{join.code}</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}

function footerCount(data: StageData, t: Translate): string {
  if (data.config?.kind === 'leaderboard') return plural(t, 'stage.players', data.leaderboard?.players ?? 0);
  if (data.config?.kind === 'qa_wall') return plural(t, 'stage.questions', data.qa.length);
  const n = data.results?.responses ?? 0;
  return plural(t, 'stage.responses', n, formatNumber(n, data.language));
}

/** Calm placeholder; while nobody has answered, the QR code is shown large (people are joining now). */
function Waiting({ join, children }: { join?: Join; children: ReactNode }) {
  return (
    <div className="stage-waiting">
      {join?.showQr ? (
        <span className="stage-waiting-qr">
          <QrCode text={join.url} label={`${join.host} ${join.code}`} />
        </span>
      ) : null}
      <p className="stage-empty">{children}</p>
    </div>
  );
}

function Visualisation({
  data,
  actions,
  t,
  join,
}: {
  data: StageData;
  actions: StageActions;
  t: Translate;
  join: Join;
}) {
  const { config, results } = data;
  if (!config) return <Waiting>{t('stage.incomplete')}</Waiting>;
  if (config.kind === 'leaderboard') return <Leaderboard view={data.leaderboard} t={t} language={data.language} />;
  if (config.kind === 'qa_wall') {
    if (!data.qaEnabled) return <Waiting>{t('stage.qaDisabled')}</Waiting>;
    if (data.qa.length === 0) return <Waiting join={join}>{t('stage.qaEmpty')}</Waiting>;
    return <QaWall items={data.qa} t={t} actions={actions} />;
  }
  switch (config.type) {
    case 'multiple_choice': {
      const hidden = config.resultsVisibility === 'on_reveal' && !(data.item?.revealed ?? false);
      const counts = results?.type === 'multiple_choice' ? results.counts : {};
      const correct = data.item?.revealed && config.correctOptionIds?.length ? new Set(config.correctOptionIds) : null;
      return (
        <div className="stage-fill">
          <Bars
            options={config.options}
            counts={counts}
            total={results?.respondents ?? 0}
            correct={correct}
            hidden={hidden}
            language={data.language}
            t={t}
          />
          {hidden ? (
            <div className="stage-hint">
              <span>{t('stage.hiddenUntilReveal')}</span>
              {actions.reveal ? (
                <button type="button" className="stage-btn" onClick={actions.reveal}>
                  {t('stage.reveal')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    }
    case 'word_cloud': {
      const words = results?.type === 'word_cloud' ? results.words : [];
      if (words.length === 0) return <Waiting join={join}>{t('stage.empty')}</Waiting>;
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
      if (entries.length === 0) return <Waiting join={join}>{t('stage.empty')}</Waiting>;
      return (
        <Wall
          entries={entries}
          hideLabel={t('stage.hide')}
          {...(actions.hideResponse ? { onHide: actions.hideResponse } : {})}
        />
      );
    }
    case 'scale':
      return (
        <Scale config={config} results={results?.type === 'scale' ? results : null} language={data.language} t={t} />
      );
    case 'quiz':
      return <Quiz data={data} config={config} actions={actions} t={t} />;
  }
}

// ---------------------------------------------------------------------------------------------

/** Horizontal bars in option order (§6.7): label, bar, percentage. The absolute total is in the footer. */
function Bars({
  options,
  counts,
  total,
  correct,
  language,
  t,
  hidden = false,
  shapes = false,
}: {
  options: { id: string; label: string }[];
  counts: Record<string, number>;
  total: number;
  correct: Set<string> | null;
  language: Language;
  t: Translate;
  hidden?: boolean;
  shapes?: boolean;
}) {
  return (
    <div className={`bars ${options.length > 5 ? 'dense' : ''}`}>
      {options.map((o, index) => {
        const n = hidden ? 0 : (counts[o.id] ?? 0);
        const pct = total > 0 ? (n / total) * 100 : 0;
        const isCorrect = correct?.has(o.id) ?? false;
        return (
          <div key={o.id} className={`bar-row ${correct && !isCorrect ? 'dim' : ''}`}>
            <span className="bar-label">
              {shapes ? <QuizShape index={index} /> : null}
              <span className="bar-text">{o.label}</span>
              {isCorrect ? <CheckIcon aria-label={t('stage.correct')} strokeWidth={3} /> : null}
            </span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="bar-value tabular" title={hidden ? undefined : formatNumber(n, language)}>
              {hidden || total === 0 ? '' : formatPercent(n, total, language)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One text size for the whole wall, chosen by how many cards there are (calmer than per-card sizes). */
function wallSize(count: number): string {
  if (count <= 6) return 'size-l';
  if (count <= 12) return 'size-m';
  return 'size-s';
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
    <div ref={ref} className={`wall ${wallSize(visible.length)}`}>
      {cols.map((col, ci) => (
        <div key={ci} className="wall-col">
          {col.map((entry) => (
            <div key={entry.id} className="wall-card hideable">
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

/**
 * Scale (§6.7): one row per statement with its distribution and average marker. The axis numbers, the end
 * labels and the "average" heading appear once for all rows instead of on every row.
 */
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
  const hasEnds = config.minLabel !== '' || config.maxLabel !== '';
  return (
    <div className="scale">
      <span />
      <div className="scale-axis tabular" aria-hidden="true">
        {values.map((v) => (
          <span key={v}>{v}</span>
        ))}
      </div>
      <span className="scale-head">{t('stage.averageLabel')}</span>
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
                  <div key={i}>
                    <div style={{ height: `${(n / peak) * 100}%` }} />
                  </div>
                ))}
              </div>
              {average !== null ? (
                <div
                  className="scale-avg-marker"
                  style={{ left: `${((average - 0.5) / config.range) * 100}%` }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <span className="scale-avg tabular">{average === null ? '–' : formatNumber(average, language, 1)}</span>
          </div>
        );
      })}
      {hasEnds ? (
        <>
          <span />
          <div className="scale-ends">
            <span>{config.minLabel}</span>
            <span>{config.maxLabel}</span>
          </div>
          <span />
        </>
      ) : null}
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
  if (state === 'idle' || state === 'answering') {
    const total = config.timeLimitSec * 1000;
    const fraction = state === 'answering' && total > 0 ? remaining / total : 1;
    const r = 44;
    const circumference = 2 * Math.PI * r;
    return (
      <div className="quiz-grid">
        <div className={`quiz-options ${config.options.length > 4 ? 'six' : ''}`}>
          {config.options.map((o, index) => (
            <div key={o.id} className="quiz-option">
              <QuizShape index={index} />
              <span>{o.label}</span>
            </div>
          ))}
        </div>
        <div className="quiz-side">
          {state === 'idle' && config.startMode === 'click' && actions.startQuiz ? (
            <button type="button" className="stage-btn primary" onClick={actions.startQuiz}>
              {t('stage.quizStart')}
            </button>
          ) : (
            <div className="quiz-timer" role="timer">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={r} fill="none" stroke="var(--track)" strokeWidth="7" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="var(--heading)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - fraction)}
                />
              </svg>
              <span className="quiz-timer-value tabular">
                {state === 'answering' ? Math.ceil(remaining / 1000) : config.timeLimitSec}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  // reveal (and closed)
  return (
    <div className="stage-fill">
      <Bars
        options={config.options}
        counts={results?.counts ?? {}}
        total={results?.respondents ?? 0}
        correct={new Set([config.correctOptionId])}
        language={data.language}
        t={t}
        shapes
      />
    </div>
  );
}

/** Top 10 in one column; ranks 1–3 emphasised by size (§6.7), no medals. */
function Leaderboard({ view, t, language }: { view: LeaderboardView | null; t: Translate; language: Language }) {
  if (!view || view.entries.length === 0) return <Waiting>{t('stage.leaderboardEmpty')}</Waiting>;
  return (
    <ol className="board">
      {view.entries.map((e) => (
        <li key={`${e.rank}-${e.nickname}`} className={`board-row ${e.rank <= 3 ? `top-${e.rank}` : 'rest'}`}>
          <span className="board-rank tabular">{e.rank}</span>
          <span className="board-name">{e.nickname}</span>
          <span className="board-points tabular">{formatNumber(e.points, language)}</span>
        </li>
      ))}
    </ol>
  );
}

function QaWall({ items, t, actions }: { items: QaItemView[]; t: Translate; actions: StageActions }) {
  const open = items.filter((q) => !q.answered).sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt);
  const answered = items.filter((q) => q.answered);
  const shown = [...open, ...answered].slice(0, DISPLAY.qaWallTop);
  return (
    <ol className="qa-list">
      {shown.map((q) => (
        <li key={q.id} className={`qa-item hideable ${q.answered ? 'answered' : ''}`}>
          <span className="qa-votes tabular">
            <ArrowUpIcon />
            {q.upvotes}
          </span>
          <span className="qa-text">{q.text}</span>
          {actions.hideQa || actions.markAnswered ? (
            <span className="qa-actions">
              {actions.markAnswered ? (
                <button
                  type="button"
                  className="hide-btn static"
                  aria-label={t('qa.answered')}
                  title={t('qa.answered')}
                  onClick={() => actions.markAnswered?.(q.id, !q.answered)}
                >
                  <CheckIcon />
                </button>
              ) : null}
              {actions.hideQa ? (
                <button type="button" className="hide-btn static" onClick={() => actions.hideQa?.(q.id)}>
                  <EyeOffIcon />
                  {t('stage.hide')}
                </button>
              ) : null}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
