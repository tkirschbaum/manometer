import {
  DISPLAY,
  type QuestionConfig,
  type ResponsePayload,
  type SlideItemConfig,
} from '@pulse/shared';
import ExcelJS from 'exceljs';
import { toCsv } from '../domain/csv';
import type { StoredPayload } from '../domain/payloads';
import { participantRef } from '../domain/secret';
import { isoInZone } from '../domain/time';
import { computeResults } from '../realtime/results';
import type { DeckRow, ItemRow, QaRow, ResponseRow, Store } from '../realtime/store';

export const CSV_COLUMNS = [
  'deck_title',
  'slide_item_id',
  'question_type',
  'prompt',
  'participant_ref',
  'nickname',
  'answer',
  'points',
  'response_ms',
  'hidden',
  'submitted_at',
] as const;

export interface ExportData {
  deck: DeckRow;
  items: { row: ItemRow; responses: ResponseRow[] }[];
  nicknames: Map<string, string | null>;
  qa: QaRow[];
}

export async function loadExportData(store: Store, deck: DeckRow): Promise<ExportData> {
  const rows = await store.listItems(deck.id);
  const items = await Promise.all(rows.map(async (row) => ({ row, responses: await store.listResponses(row.id) })));
  const nicknames = new Map((await store.listNicknames(deck.id)).map((p) => [p.id, p.nickname]));
  return { deck, items: items.filter((i) => i.row.kind === 'question'), nicknames, qa: await store.listQaForExport(deck.id) };
}

function questionOf(config: SlideItemConfig): QuestionConfig | null {
  return config.kind === 'question' ? config : null;
}

/** Human-readable answer for one response, using the labels of the current config. */
export function answerText(config: SlideItemConfig, payload: StoredPayload | ResponsePayload): string {
  const question = questionOf(config);
  const label = (id: string): string =>
    question && (question.type === 'multiple_choice' || question.type === 'quiz')
      ? (question.options.find((o) => o.id === id)?.label ?? id)
      : id;
  switch (payload.type) {
    case 'multiple_choice':
      return payload.optionIds.map(label).join(', ');
    case 'quiz':
      return label(payload.optionId);
    case 'word_cloud':
    case 'open_text':
      return payload.text;
    case 'scale': {
      const statements = question?.type === 'scale' ? question.statements : [];
      return Object.entries(payload.ratings)
        .map(([id, value]) => `${statements.find((s) => s.id === id)?.label ?? id}: ${value}`)
        .join(' | ');
    }
  }
}

function typeOf(row: ItemRow): string {
  return row.type ?? row.kind;
}

function promptOf(config: SlideItemConfig): string {
  return config.kind === 'question' ? config.prompt : '';
}

export function buildCsv(data: ExportData, salt: string, timeZone: string): string {
  const title = data.deck.settings.title;
  const rows: (string | number | boolean | null)[][] = [[...CSV_COLUMNS]];
  for (const { row, responses } of data.items) {
    for (const r of responses) {
      rows.push([
        title,
        row.id,
        typeOf(row),
        promptOf(row.config),
        participantRef(r.participantId, salt),
        data.nicknames.get(r.participantId) ?? null,
        answerText(row.config, r.payload),
        r.points,
        r.responseMs,
        r.hidden,
        isoInZone(r.createdAt, timeZone),
      ]);
    }
  }
  for (const q of data.qa) {
    rows.push([
      title,
      null,
      'qa',
      null,
      participantRef(q.participantId, salt),
      data.nicknames.get(q.participantId) ?? null,
      q.text,
      null,
      null,
      q.hidden,
      isoInZone(q.createdAt, timeZone),
    ]);
  }
  return toCsv(rows);
}

function sheetName(index: number, label: string, used: Set<string>): string {
  const clean = label.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  let name = `${index} ${clean}`.slice(0, 31).trim();
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${index}-${n} ${clean}`.slice(0, 31).trim();
  used.add(name.toLowerCase());
  return name;
}

function summaryDetails(row: ItemRow, responses: ResponseRow[]): string {
  const question = questionOf(row.config);
  if (!question) return '';
  const results = computeResults(
    question,
    responses.map((r) => ({
      id: r.id,
      clientResponseId: r.clientResponseId,
      participantId: r.participantId,
      payload: r.payload,
      points: r.points,
      responseMs: r.responseMs,
      hidden: r.hidden,
      createdAt: r.createdAt.getTime(),
    })),
  );
  switch (results.type) {
    case 'multiple_choice':
    case 'quiz': {
      const options = question.type === 'multiple_choice' || question.type === 'quiz' ? question.options : [];
      return options
        .map((o) => {
          const n = results.counts[o.id] ?? 0;
          const pct = results.respondents > 0 ? Math.round((n / results.respondents) * 100) : 0;
          const mark = question.type === 'quiz' && question.correctOptionId === o.id ? ' (richtig/correct)' : '';
          return `${o.label}: ${n} (${pct} %)${mark}`;
        })
        .join('\n');
    }
    case 'word_cloud':
      return results.words
        .slice(0, DISPLAY.wordCloudMaxWords)
        .map((w) => `${w.text}: ${w.count}`)
        .join('\n');
    case 'open_text':
      return `${results.responses}`;
    case 'scale': {
      const statements = question.type === 'scale' ? question.statements : [];
      return results.statements
        .map((s) => {
          const label = statements.find((x) => x.id === s.id)?.label ?? s.id;
          return `${label}: ${s.average === null ? '–' : s.average.toFixed(1)} (n=${s.n})`;
        })
        .join('\n');
    }
  }
}

export async function buildXlsx(data: ExportData, salt: string, timeZone: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Pulse';
  workbook.created = new Date();
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: '#', key: 'n', width: 5 },
    { header: 'question_type', key: 'type', width: 18 },
    { header: 'prompt', key: 'prompt', width: 50 },
    { header: 'respondents', key: 'respondents', width: 13 },
    { header: 'responses', key: 'responses', width: 11 },
    { header: 'results', key: 'details', width: 60 },
    { header: 'slide_item_id', key: 'id', width: 38 },
  ];
  summary.getRow(1).font = { bold: true };
  const used = new Set<string>(['summary', 'q&a']);
  data.items.forEach(({ row, responses }, index) => {
    const visible = responses.filter((r) => !r.hidden);
    summary.addRow({
      n: index + 1,
      type: typeOf(row),
      prompt: promptOf(row.config),
      respondents: new Set(visible.map((r) => r.participantId)).size,
      responses: visible.length,
      details: summaryDetails(row, responses),
      id: row.id,
    }).alignment = { wrapText: true, vertical: 'top' };

    const sheet = workbook.addWorksheet(sheetName(index + 1, promptOf(row.config) || typeOf(row), used));
    sheet.columns = [
      { header: 'participant_ref', key: 'ref', width: 16 },
      { header: 'nickname', key: 'nickname', width: 20 },
      { header: 'answer', key: 'answer', width: 60 },
      { header: 'points', key: 'points', width: 9 },
      { header: 'response_ms', key: 'ms', width: 12 },
      { header: 'hidden', key: 'hidden', width: 8 },
      { header: 'submitted_at', key: 'at', width: 27 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of responses) {
      sheet.addRow({
        ref: participantRef(r.participantId, salt),
        nickname: data.nicknames.get(r.participantId) ?? '',
        answer: answerText(row.config, r.payload),
        points: r.points ?? '',
        ms: r.responseMs ?? '',
        hidden: r.hidden,
        at: isoInZone(r.createdAt, timeZone),
      });
    }
  });
  if (data.qa.length > 0) {
    const sheet = workbook.addWorksheet('Q&A');
    sheet.columns = [
      { header: 'participant_ref', key: 'ref', width: 16 },
      { header: 'question', key: 'text', width: 70 },
      { header: 'upvotes', key: 'upvotes', width: 9 },
      { header: 'answered', key: 'answered', width: 10 },
      { header: 'hidden', key: 'hidden', width: 8 },
      { header: 'submitted_at', key: 'at', width: 27 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const q of data.qa) {
      sheet.addRow({
        ref: participantRef(q.participantId, salt),
        text: q.text,
        upvotes: q.upvotes,
        answered: q.answered,
        hidden: q.hidden,
        at: isoInZone(q.createdAt, timeZone),
      });
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function exportFileName(deck: DeckRow, ext: 'csv' | 'xlsx', timeZone: string): string {
  const day = isoInZone(new Date(), timeZone).slice(0, 10);
  const slug =
    deck.settings.title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40) || `pulse-${deck.joinCode}`;
  return `${slug}-${day}.${ext}`;
}
