import { PRODUCT_NAME, formatJoinCode, type MessageKey, type Translate } from '@pulse/shared';
import { useState } from 'react';
import type { DeckChoice } from '../controller';
import type { RegistryEntry } from '../model/registry';
import { SLIDE_KINDS, type SlideKind } from '../model/draft';
import { Menu, MenuItem } from '../ui/controls';
import { KindIcon } from '../ui/icons';

export function kindLabel(kind: SlideKind, t: Translate): string {
  return t(`type.${kind}` as MessageKey);
}

/**
 * First screen of a fresh frame (§6.1): "What would you like to ask?" with one card per slide type.
 * Picking a type links or creates the presentation's deck automatically; the join code is only mentioned
 * when it is a guess (no document store) and can be changed there.
 */
/** One palette colour per slide type, so the types are easy to tell apart. */
const KIND_COLORS = ['#3d5af1', '#7c5cf0', '#16a37f', '#f0574a', '#e04a8a', '#f5a524', '#101834'];

export function KindPicker({
  onPick,
  t,
  deckChoice,
  linked,
  onChooseDeck,
}: {
  onPick: (kind: SlideKind) => void;
  t: Translate;
  deckChoice: DeckChoice | null;
  /** True when the frame already belongs to a deck (e.g. read from the presentation). */
  linked: boolean;
  onChooseDeck: (entry: RegistryEntry | null) => void;
}) {
  const [menu, setMenu] = useState(false);
  const suggested = deckChoice?.suggested ?? null;
  const options = deckChoice?.options ?? [];
  const showDeckLine = !linked && deckChoice !== null && (suggested !== null || options.length > 0);
  const name = (e: RegistryEntry): string =>
    t('editor.deck.option', {
      title: e.title || t('editor.empty.untitled'),
      code: e.joinCode ? formatJoinCode(e.joinCode) : '–',
    });

  return (
    <div className="flex h-full flex-col overflow-auto px-5 py-4">
      <div className="flex items-center gap-1.5 text-[13px] font-extrabold text-ink">
        <span className="flex size-5 items-center justify-center rounded-[6px] bg-primary" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12h4l2.5-6 5 12 2.5-6h4"
              stroke="#ffffff"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {PRODUCT_NAME}
      </div>
      <h1 className="mt-2 mb-3 text-[21px] leading-tight font-extrabold tracking-tight text-ink">
        {t('editor.welcome')}
      </h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        {SLIDE_KINDS.map((kind, index) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              onPick(kind);
            }}
            className="group flex items-start gap-3 rounded-[12px] border border-line bg-paper px-3 py-2.5 text-left transition-[border-color,box-shadow] hover:border-primary hover:shadow-[0_4px_14px_-6px_rgb(16_24_52/0.25)] focus-visible:border-primary"
          >
            <span
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] text-paper transition-transform group-hover:scale-105"
              style={{ background: KIND_COLORS[index % KIND_COLORS.length] }}
            >
              <KindIcon kind={kind} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-ink">{kindLabel(kind, t)}</span>
              <span className="text-[12px] leading-snug text-muted">{t(`type.desc.${kind}` as MessageKey)}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[12px] text-muted">
        <span>{t('editor.empty.resizeHint')}</span>
        {showDeckLine ? (
          <span className="relative ml-auto flex items-center gap-1.5">
            <span className="tabular">
              {suggested
                ? t('editor.deck.recent', { code: suggested.joinCode ? formatJoinCode(suggested.joinCode) : '–' })
                : t('editor.deck.new')}
            </span>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => {
                setMenu(!menu);
              }}
              className="font-semibold text-ink underline"
            >
              {t('editor.deck.change')}
            </button>
            <Menu
              open={menu}
              onClose={() => {
                setMenu(false);
              }}
              above
            >
              <p className="px-3 pt-1 pb-1.5 text-[12px] font-semibold text-muted">{t('editor.deck.pick')}</p>
              <MenuItem
                onSelect={() => {
                  onChooseDeck(null);
                  setMenu(false);
                }}
              >
                {t('editor.deck.new')}
              </MenuItem>
              {options.map((e) => (
                <MenuItem
                  key={e.deckId}
                  onSelect={() => {
                    onChooseDeck(e);
                    setMenu(false);
                  }}
                >
                  <span className="tabular">{name(e)}</span>
                </MenuItem>
              ))}
            </Menu>
          </span>
        ) : null}
      </div>
    </div>
  );
}
