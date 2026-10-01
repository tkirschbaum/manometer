import { DISPLAY, type QuestionConfig, type ResultsView } from '@pulse/shared';
import type { StoredPayload } from '../domain/payloads';
import { displayForm } from '../domain/words';

/** One response as kept in memory for the active item (§5.4). */
export interface LiveResponse {
  /** Database id once stored; null while the insert is in flight. */
  id: number | null;
  clientResponseId: string;
  participantId: string;
  payload: StoredPayload;
  points: number | null;
  responseMs: number | null;
  hidden: boolean;
  createdAt: number;
}

/** Aggregates the in-memory responses of one question into the view sent to presenters. */
export function computeResults(config: QuestionConfig, list: readonly LiveResponse[]): ResultsView {
  const visible = list.filter((r) => !r.hidden);
  const respondents = new Set(visible.map((r) => r.participantId)).size;
  const base = { itemId: config.id, respondents, responses: visible.length };

  switch (config.type) {
    case 'multiple_choice':
    case 'quiz': {
      const counts: Record<string, number> = Object.fromEntries(config.options.map((o) => [o.id, 0]));
      for (const r of visible) {
        const ids =
          r.payload.type === 'multiple_choice'
            ? r.payload.optionIds
            : r.payload.type === 'quiz'
              ? [r.payload.optionId]
              : [];
        for (const id of ids) if (id in counts) counts[id] = (counts[id] ?? 0) + 1;
      }
      return config.type === 'quiz' ? { ...base, type: 'quiz', counts } : { ...base, type: 'multiple_choice', counts };
    }
    case 'word_cloud': {
      const groups = new Map<string, { count: number; casings: Map<string, number> }>();
      for (const r of visible) {
        if (r.payload.type !== 'word_cloud') continue;
        const group = groups.get(r.payload.key) ?? { count: 0, casings: new Map<string, number>() };
        group.count += 1;
        group.casings.set(r.payload.text, (group.casings.get(r.payload.text) ?? 0) + 1);
        groups.set(r.payload.key, group);
      }
      const words = [...groups.entries()]
        .map(([key, g]) => ({ key, text: displayForm(g.casings), count: g.count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
        .slice(0, DISPLAY.wordCloudMaxWords);
      return { ...base, type: 'word_cloud', words };
    }
    case 'open_text': {
      const entries = visible
        .filter(
          (r): r is LiveResponse & { payload: { type: 'open_text'; text: string } } => r.payload.type === 'open_text',
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, DISPLAY.openTextMaxSent)
        .map((r) => ({ id: String(r.id ?? ''), text: r.payload.text, at: r.createdAt }))
        .filter((e) => e.id !== '');
      return { ...base, type: 'open_text', entries };
    }
    case 'scale': {
      const statements = config.statements.map((statement) => {
        const histogram = new Array<number>(config.range).fill(0);
        let sum = 0;
        let n = 0;
        for (const r of visible) {
          if (r.payload.type !== 'scale') continue;
          const value = r.payload.ratings[statement.id];
          if (value === undefined || value < 1 || value > config.range) continue;
          histogram[value - 1] = (histogram[value - 1] ?? 0) + 1;
          sum += value;
          n += 1;
        }
        return { id: statement.id, n, average: n > 0 ? sum / n : null, histogram };
      });
      return { ...base, type: 'scale', statements };
    }
  }
}
