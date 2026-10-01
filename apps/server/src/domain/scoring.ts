/** Quiz points (§5.6): correct answers score 500–1000 depending on speed, wrong or missing answers 0. */
export function quizPoints(correct: boolean, responseMs: number, timeLimitSec: number): number {
  if (!correct) return 0;
  const limitMs = timeLimitSec * 1000;
  const clamped = Math.min(Math.max(responseMs, 0), limitMs);
  return Math.round(1000 * (1 - clamped / limitMs / 2));
}

export interface LeaderboardRow {
  participantId: string;
  nickname: string;
  points: number;
  totalResponseMs: number;
}

/** Sorted by points (desc), ties broken by lower cumulative response time (§5.6). Ranks follow that order. */
export function rankLeaderboard(rows: LeaderboardRow[]): (LeaderboardRow & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => b.points - a.points || a.totalResponseMs - b.totalResponseMs || a.nickname.localeCompare(b.nickname),
  );
  let previousKey = '';
  let rank = 0;
  return sorted.map((row, index) => {
    const key = `${row.points}:${row.totalResponseMs}`;
    if (key !== previousKey) rank = index + 1;
    previousKey = key;
    return { ...row, rank };
  });
}
