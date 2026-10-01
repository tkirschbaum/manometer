import { PRODUCT_NAME, formatJoinCode, type Translate } from '@pulse/shared';
import { useState } from 'react';
import type { RegistryEntry } from '../model/registry';
import type { DeckLink } from '../office/types';
import { Button } from '../ui/controls';

/**
 * Fresh instance without a deck (§6.1, §6.4): offer the most recently used live session of this device,
 * other sessions, or a new one. The document-level store (if it works) links silently before this shows.
 */
export function EmptyState({
  candidates,
  onCreate,
  onLink,
  t,
}: {
  candidates: RegistryEntry[] | null;
  onCreate: () => void;
  onLink: (link: DeckLink) => void;
  t: Translate;
}) {
  const [choosing, setChoosing] = useState(false);
  const latest = candidates?.[0];
  const name = (e: RegistryEntry): string => e.title || t('editor.empty.untitled');
  return (
    <div className="flex h-full flex-col justify-center gap-4 overflow-auto px-6 py-4">
      <div className="flex items-center gap-2 text-[15px] font-bold text-navy">
        {PRODUCT_NAME}
        <span className="inline-block size-1.5 rounded-full bg-red" aria-hidden="true" />
      </div>
      <h1 className="text-[22px] leading-tight font-bold text-navy">{t('editor.empty.title')}</h1>
      {candidates === null ? (
        <p className="text-muted">{t('editor.connecting')}</p>
      ) : choosing ? (
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{t('editor.chooseSession')}</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
            {candidates.map((e) => (
              <li key={e.deckId}>
                <button
                  type="button"
                  onClick={() => {
                    onLink(e);
                  }}
                  className="flex w-full items-baseline justify-between gap-3 rounded-brand border border-line px-3 py-2 text-left hover:border-navy"
                >
                  <span className="font-semibold">{name(e)}</span>
                  <span className="tabular text-muted">{e.joinCode ? formatJoinCode(e.joinCode) : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setChoosing(false);
              }}
            >
              {t('common.back')}
            </Button>
            <Button onClick={onCreate}>{t('editor.empty.startNew')}</Button>
          </div>
        </div>
      ) : latest ? (
        <div className="flex flex-col items-start gap-2">
          <Button
            variant="primary"
            onClick={() => {
              onLink(latest);
            }}
          >
            {t('editor.empty.connect', {
              title: name(latest),
              code: latest.joinCode ? formatJoinCode(latest.joinCode) : '–',
            })}
          </Button>
          <div className="flex flex-wrap gap-2">
            {candidates.length > 1 ? (
              <Button
                onClick={() => {
                  setChoosing(true);
                }}
              >
                {t('editor.empty.otherSession')}
              </Button>
            ) : null}
            <Button onClick={onCreate}>{t('editor.empty.startNew')}</Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" className="self-start" onClick={onCreate}>
          {t('editor.empty.newSession')}
        </Button>
      )}
      <p className="text-[12px] text-muted">{t('editor.empty.resizeHint')}</p>
    </div>
  );
}
