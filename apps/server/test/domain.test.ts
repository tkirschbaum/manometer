import { describe, expect, it, vi } from 'vitest';
import { csvCell, toCsv } from '../src/domain/csv';
import { allocateJoinCode, isAcceptableJoinCode, randomJoinCode } from '../src/domain/joinCode';
import { quizPoints, rankLeaderboard } from '../src/domain/scoring';
import { canonicalJson, configHash, hashSecret, participantRef, secretMatches } from '../src/domain/secret';
import { debounce, trailingThrottle } from '../src/domain/throttle';
import { isoInZone, localClock } from '../src/domain/time';
import { TokenService } from '../src/domain/tokens';
import { displayForm, normaliseWord } from '../src/domain/words';
import { SlidingWindowLimiter } from '../src/domain/rateLimit';

describe('quiz scoring', () => {
  it('scores 1000 for instant, 500 at the limit, 0 when wrong', () => {
    expect(quizPoints(true, 0, 20)).toBe(1000);
    expect(quizPoints(true, 20_000, 20)).toBe(500);
    expect(quizPoints(true, 10_000, 20)).toBe(750);
    expect(quizPoints(true, 2000, 20)).toBe(950);
    expect(quizPoints(false, 0, 20)).toBe(0);
  });

  it('clamps edge times', () => {
    expect(quizPoints(true, -50, 10)).toBe(1000);
    expect(quizPoints(true, 10_300, 10)).toBe(500); // answered in the grace window
    expect(quizPoints(true, 1, 60)).toBe(1000);
    expect(quizPoints(true, 59_999, 60)).toBe(500);
  });

  it('ranks by points, then by lower cumulative time', () => {
    const ranked = rankLeaderboard([
      { participantId: 'a', nickname: 'A', points: 900, totalResponseMs: 5000 },
      { participantId: 'b', nickname: 'B', points: 900, totalResponseMs: 3000 },
      { participantId: 'c', nickname: 'C', points: 1200, totalResponseMs: 9000 },
      { participantId: 'd', nickname: 'D', points: 900, totalResponseMs: 3000 },
    ]);
    expect(ranked.map((r) => [r.nickname, r.rank])).toEqual([
      ['C', 1],
      ['B', 2],
      ['D', 2],
      ['A', 4],
    ]);
  });
});

describe('word normalisation', () => {
  it('trims, collapses whitespace, strips edge punctuation, keeps ß ≠ ss', () => {
    expect(normaliseWord('  Herz  Kreislauf!! ')).toEqual({ text: 'Herz Kreislauf', key: 'herz kreislauf' });
    expect(normaliseWord('„Straße“')).toEqual({ text: 'Straße', key: 'straße' });
    expect(normaliseWord('Strasse')?.key).toBe('strasse');
    expect(normaliseWord('é')?.text).toBe('é'); // NFC
    expect(normaliseWord('C++')?.text).toBe('C');
    expect(normaliseWord('...')).toBeNull();
    expect(normaliseWord('')).toBeNull();
    expect(normaliseWord('a'.repeat(25))?.text).toHaveLength(25);
    expect(normaliseWord('a'.repeat(26))).toBeNull();
  });

  it('displays the most frequent casing', () => {
    expect(displayForm(new Map([['herz', 1], ['Herz', 3], ['HERZ', 1]]))).toBe('Herz');
  });
});

describe('join codes', () => {
  it('rejects 4+ identical digits and simple sequences', () => {
    expect(isAcceptableJoinCode('482913')).toBe(true);
    expect(isAcceptableJoinCode('111123')).toBe(false);
    expect(isAcceptableJoinCode('121212')).toBe(true);
    expect(isAcceptableJoinCode('181811')).toBe(false);
    expect(isAcceptableJoinCode('123456')).toBe(false);
    expect(isAcceptableJoinCode('654321')).toBe(false);
    expect(isAcceptableJoinCode('012345')).toBe(false);
    expect(isAcceptableJoinCode('12345')).toBe(false);
  });

  it('pads and skips rejected random values', () => {
    const values = [111_111, 42, 70_582];
    // 111111 and 000042 are rejected (4+ identical digits), 070582 is fine.
    expect(randomJoinCode(() => values.shift() ?? 482_913)).toBe('070582');
  });

  it('retries on collision', async () => {
    const codes = ['482913', '482913', '730582'];
    const taken = new Set(['482913']);
    const tryInsert = vi.fn((code: string) => Promise.resolve(!taken.has(code)));
    await expect(allocateJoinCode(tryInsert, () => codes.shift() ?? '999999')).resolves.toBe('730582');
    expect(tryInsert).toHaveBeenCalledTimes(3);
    await expect(allocateJoinCode(() => Promise.resolve(false), () => '482913', 3)).rejects.toThrow();
  });
});

describe('csv', () => {
  it('writes BOM, semicolons, CRLF and quotes ; " and newlines', () => {
    const csv = toCsv([
      ['a', 'b;c', 'say "hi"'],
      ['line\nbreak', 3, null],
    ]);
    expect(csv).toBe('﻿a;"b;c";"say ""hi"""\r\n"line\nbreak";3;\r\n');
  });

  it('neutralises formulas', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+43 660')).toBe("'+43 660");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(false)).toBe('false');
  });
});

describe('secrets and hashes', () => {
  it('matches secrets in constant time', () => {
    const hash = hashSecret('abc');
    expect(secretMatches('abc', hash)).toBe(true);
    expect(secretMatches('abd', hash)).toBe(false);
    expect(secretMatches('abc', 'beef')).toBe(false);
  });

  it('participant refs are stable and salted', () => {
    expect(participantRef('p1', 'salt-a')).toHaveLength(8);
    expect(participantRef('p1', 'salt-a')).toBe(participantRef('p1', 'salt-a'));
    expect(participantRef('p1', 'salt-a')).not.toBe(participantRef('p1', 'salt-b'));
  });

  it('config hash ignores key order', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(configHash({ a: 1, b: 2 })).toBe(configHash({ b: 2, a: 1 }));
  });
});

describe('tokens', () => {
  it('signs, verifies, expires and is single use for entry tokens', () => {
    let now = 1_000_000;
    const tokens = new TokenService('s'.repeat(40), () => now);
    const deckId = '5b8f8b9e-6a4e-4a4b-9e1d-0d1f2a3b4c5d';
    const entry = tokens.sign(deckId, 'entry');
    expect(tokens.verify(entry, 'session')).toBeNull(); // wrong kind
    expect(tokens.verify(entry, 'entry')?.d).toBe(deckId);
    expect(tokens.verify(entry, 'entry')).toBeNull(); // used
    const late = tokens.sign(deckId, 'entry');
    now += 5 * 60_000 + 1;
    expect(tokens.verify(late, 'entry')).toBeNull(); // expired
    const session = tokens.sign(deckId, 'session');
    expect(tokens.verify(session, 'session')).not.toBeNull();
    expect(tokens.verify(session, 'session')).not.toBeNull(); // multi use
    const [body, mac] = session.split('.');
    expect(tokens.verify(`${body}x.${mac}`, 'session')).toBeNull(); // tampered
    expect(new TokenService('t'.repeat(40), () => now).verify(session, 'session')).toBeNull(); // other secret
    expect(tokens.verify(undefined, 'session')).toBeNull();
  });
});

describe('throttle', () => {
  it('runs at most once per interval with a trailing call', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const fn = vi.fn();
    const t = trailingThrottle(fn, 250);
    t.schedule();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      t.schedule();
      vi.advanceTimersByTime(20);
    }
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2); // nothing pending
    t.schedule();
    t.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('debounces', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 1000);
    d.schedule();
    vi.advanceTimersByTime(900);
    d.schedule();
    vi.advanceTimersByTime(900);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('rate limit and time', () => {
  it('sliding window', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    expect(limiter.take('x')).toBe(true);
    expect(limiter.take('x')).toBe(true);
    expect(limiter.take('x')).toBe(false);
    expect(limiter.take('y')).toBe(true);
    now = 1001;
    expect(limiter.take('x')).toBe(true);
  });

  it('formats Vienna time with offset', () => {
    expect(isoInZone(new Date('2026-07-01T10:00:00Z'), 'Europe/Vienna')).toBe('2026-07-01T12:00:00+02:00');
    expect(isoInZone(new Date('2026-12-01T10:00:00Z'), 'Europe/Vienna')).toBe('2026-12-01T11:00:00+01:00');
    expect(isoInZone(new Date('2026-12-01T10:00:00Z'), 'UTC')).toBe('2026-12-01T10:00:00+00:00');
    expect(localClock(new Date('2026-12-01T02:31:00Z'), 'Europe/Vienna')).toEqual({ day: '2026-12-01', minutes: 3 * 60 + 31 });
  });
});
