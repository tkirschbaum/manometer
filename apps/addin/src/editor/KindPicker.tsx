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
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-navy">
        {PRODUCT_NAME}
        <span className="inline-block size-1.5 rounded-full bg-red" aria-hidden="true" />
      </div>
      <h1 className="mt-1 mb-3 text-[20px] leading-tight font-bold text-navy">{t('editor.welcome')}</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        {SLIDE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              onPick(kind);
            }}
            className="group flex items-start gap-3 rounded-brand border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-navy focus-visible:border-navy"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-brand bg-mist text-navy group-hover:bg-navy group-hover:text-paper">
              <KindIcon kind={kind} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold text-navy">{kindLabel(kind, t)}</span>
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
              className="font-semibold text-navy underline"
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
