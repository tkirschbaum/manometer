/** ISO 8601 timestamp in a time zone with its offset, e.g. 2026-10-01T14:05:09+02:00 (§5.7). */
export function isoInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const offsetRaw = get('timeZoneName').replace('GMT', '');
  const offset = offsetRaw === '' ? '+00:00' : offsetRaw;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset}`;
}

/** Local date (YYYY-MM-DD) and minutes since midnight in a time zone. */
export function localClock(date: Date, timeZone: string): { day: string; minutes: number } {
  const iso = isoInZone(date, timeZone);
  const hours = Number(iso.slice(11, 13));
  const minutes = Number(iso.slice(14, 16));
  return { day: iso.slice(0, 10), minutes: hours * 60 + minutes };
}
