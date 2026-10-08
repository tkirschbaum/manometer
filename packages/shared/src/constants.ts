/** User-facing product name. Placeholder (master prompt §0); change it here only. */
export const PRODUCT_NAME = 'Pulse';

export const LIMITS = {
  titleMax: 120,
  promptMax: 200,
  optionLabelMax: 80,
  mcOptionsMin: 2,
  mcOptionsMax: 8,
  quizOptionsMin: 2,
  quizOptionsMax: 6,
  statementsMin: 1,
  statementsMax: 3,
  statementLabelMax: 120,
  scaleLabelMax: 30,
  wordMax: 25,
  wordInputMax: 100,
  textMax: 280,
  qaMax: 280,
  nicknameMin: 2,
  nicknameMax: 20,
  openTextEntriesMax: 5,
  maxParticipantsPerDeck: 250,
} as const;

export const TIMING = {
  /** Editor writes to file and server this long after the last change. */
  editorDebounceMs: 600,
  /** §5.4: at most 4 updates per second. 250 ms plus a 10 ms margin so delivery jitter never squeezes a fifth update into one second. */
  presenterResultsThrottleMs: 260,
  participantResultsThrottleMs: 1000,
  participantCountDebounceMs: 1000,
  qaThrottleMs: 250,
  /** Active item survives a lost presenter socket this long. */
  activeGraceMs: 10_000,
  /**
   * After a slide is left, phones keep its question this long. If the next Pulse slide activates in the
   * meantime (its frame needs 1–2 s to load), phones switch straight to it instead of flashing the waiting screen.
   */
  handoverMs: 2500,
  quizCountdownMs: 3000,
  quizLateGraceMs: 300,
  slidePollMs: 1000,
  wordCloudRelayoutMs: 1500,
  openTextScrollMs: 6000,
} as const;

export const DISPLAY = {
  wordCloudMaxWords: 80,
  openTextMaxVisible: 24,
  openTextMaxSent: 60,
  qaWallTop: 8,
  leaderboardTop: 10,
} as const;

export const QUIZ_TIME_LIMITS = [10, 15, 20, 30, 45, 60] as const;

export const RATE_LIMITS = {
  submissionsPerWindow: 10,
  submissionWindowMs: 10_000,
  qaPerDeckPerHour: 20,
  connectionsPerIpPerMinute: 600,
  deckCreationsPerHour: 300,
} as const;

export const STORAGE_KEYS = {
  participantId: 'pulse.pid',
  participantCookie: 'pulse_pid',
  language: 'pulse.lang',
  nicknamePrefix: 'pulse.nick.',
  pendingPrefix: 'pulse.pending.',
  deckRegistry: 'pulse.decks',
  heartbeatPrefix: 'pulse.hb.',
  saveReminder: 'pulse.saveReminder',
} as const;

/** Office settings key that holds everything an add-in instance stores in the .pptx (§6.3). */
export const ADDIN_SETTINGS_KEY = 'pulse';
