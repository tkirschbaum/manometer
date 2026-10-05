import { formatJoinCode, type Translate } from '@pulse/shared';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AddinController, ControllerState } from '../controller';
import type { LiveState } from '../live/live';
import { SLIDE_KINDS, kindOf, previewConfig, type SlideKind } from '../model/draft';
import { Stage } from '../stage/Stage';
import { liveStageData } from '../stage/SlideshowStage';
import { Button, ConfirmDialog, Menu, MenuItem, Toast } from '../ui/controls';
import { CheckIcon, ChevronDownIcon, KindIcon, MoreIcon, PencilIcon } from '../ui/icons';
import { ItemForm } from './ItemForm';
import { KindPicker, kindLabel } from './KindPicker';
import { ResultsPeek } from './ResultsPeek';
import { SettingsPanel } from './SettingsPanel';
import { previewResults } from './previewData';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access can be blocked inside Office webviews; the toast then shows the link instead.
    return false;
  }
}

function isMac(): boolean {
  return /Mac/i.test(navigator.platform) || /Macintosh/i.test(navigator.userAgent);
}

function subscribeResize(callback: () => void): () => void {
  window.addEventListener('resize', callback);
  return () => {
    window.removeEventListener('resize', callback);
  };
}

/** The editor sits inside the frame on the slide; with enough room it shows form and preview side by side. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth >= 760 && window.innerHeight >= 340,
    () => false,
  );
}

/**
 * Edit-mode UI inside the frame (§6.8). Three states:
 *  1. fresh frame → "What would you like to ask?" (type cards; the deck is linked/created automatically),
 *  2. editing → form (+ live preview when wide), "Done" returns to the slide,
 *  3. done → the slide exactly as in the slideshow; click anywhere to edit again.
 */
export function Editor({
  controller,
  state,
  live,
  t,
  webUnsupported,
}: {
  controller: AddinController;
  state: ControllerState;
  live: LiveState;
  t: Translate;
  webUnsupported: boolean;
}) {
  // null = not decided by the user yet: incomplete slides open in the form, finished ones show the slide.
  const [editing, setEditing] = useState<boolean | null>(null);

  if (webUnsupported) {
    return (
      <div className="flex h-full items-center p-6">
        <p role="alert" className="text-[16px] font-semibold text-navy">
          {t('editor.webUnsupported')}
        </p>
      </div>
    );
  }

  const { settings } = state;
  const draft = settings.item;
  const interaction = {
    onPointerDownCapture: () => void controller.onEditorInteraction(),
    onFocusCapture: () => void controller.onEditorInteraction(),
  };

  if (!draft) {
    return (
      <div className="h-full" {...interaction}>
        <KindPicker
          onPick={(kind) => {
            setEditing(true);
            void controller.pickKind(kind);
          }}
          t={t}
          deckChoice={state.deckChoice}
          linked={settings.deck !== null}
          onChooseDeck={(entry) => {
            controller.chooseDeck(entry);
          }}
        />
      </div>
    );
  }

  const needsSetup =
    controller.missing.length > 0 || (draft.kind === 'qa_wall' && !(settings.deck?.settings.qaEnabled ?? false));
  const isEditing = editing ?? needsSetup;

  return (
    <div className="h-full" {...interaction}>
      {isEditing ? (
        <EditView
          controller={controller}
          state={state}
          live={live}
          t={t}
          onDone={() => {
            setEditing(false);
          }}
        />
      ) : (
        <SlideView
          controller={controller}
          state={state}
          live={live}
          t={t}
          onEdit={() => {
            setEditing(true);
          }}
        />
      )}
      <Notices state={state} t={t} />
    </div>
  );
}

function Notices({ state, t }: { state: ControllerState; t: Translate }) {
  return (
    <Toast
      message={
        state.toast === 'copyDetected'
          ? t('editor.copyDetected')
          : state.toast === 'linkCopied'
            ? (state.copyFallback ?? t('editor.linkCopied'))
            : null
      }
    />
  );
}

/** The slide as it will be presented (live data, no sample values). Click anywhere to edit. */
function SlideView({
  controller,
  state,
  live,
  t,
  onEdit,
}: {
  controller: AddinController;
  state: ControllerState;
  live: LiveState;
  t: Translate;
  onEdit: () => void;
}) {
  return (
    <div className="group relative h-full cursor-pointer" onClick={onEdit}>
      <Stage data={liveStageData(state, live, controller.config)} />
      {state.duplicate ? (
        <div className="absolute inset-x-3 top-3 flex items-center gap-2 rounded-brand border border-line bg-paper px-3 py-1.5 text-[13px] text-ink">
          <span className="min-w-0 flex-1">{t('editor.duplicateBanner')}</span>
          <button
            type="button"
            className="font-semibold text-navy underline"
            onClick={(e) => {
              e.stopPropagation();
              controller.fork();
            }}
          >
            {t('editor.duplicateAction')}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-brand border border-line bg-paper/95 px-3 py-1.5 text-[13px] font-semibold text-navy transition-colors group-hover:border-navy group-hover:bg-navy group-hover:text-paper"
      >
        <PencilIcon size={15} />
        {t('editor.edit')}
      </button>
    </div>
  );
}

function EditView({
  controller,
  state,
  live,
  t,
  onDone,
}: {
  controller: AddinController;
  state: ControllerState;
  live: LiveState;
  t: Translate;
  onDone: () => void;
}) {
  const { settings } = state;
  const wide = useWide();
  const [menu, setMenu] = useState<'kind' | 'more' | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'reset' } | { kind: 'changeKind'; to: SlideKind } | null>(null);
  const confirmOpen = useRef(false);
  useEffect(() => {
    confirmOpen.current = confirm !== null;
  }, [confirm]);

  // Clicking outside the frame (back on the PowerPoint slide) shows the finished slide again.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onBlur = (): void => {
      timer = setTimeout(() => {
        if (!document.hasFocus() && !confirmOpen.current && controller.missing.length === 0) onDone();
      }, 250);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      if (timer) clearTimeout(timer);
    };
  }, [controller, onDone]);

  const deck = settings.deck;
  const draft = settings.item;
  if (!deck || !draft) return null;

  const kind = kindOf(draft);
  const config = controller.config;
  const missing = controller.missing;
  const connected = live.status === 'connected';
  const synced = config !== null && controller.configHash(config) === settings.lastSyncedHash;
  const isQuestion = draft.kind === 'question';
  const closed = live.item?.state === 'closed';
  const hasContent = draft.prompt.trim().length > 0 || draft.options.some((o) => o.label.trim());

  let status: ReactNode;
  if (state.saving || (connected && isQuestion && missing.length === 0 && !synced)) status = t('editor.status.saving');
  else if (missing.length > 0) status = t('editor.status.incomplete', { missing: missing.map((m) => t(m)).join(', ') });
  else if (!connected) status = t('editor.status.offline');
  else
    status = (
      <span className="inline-flex items-center gap-1 text-navy">
        <CheckIcon size={14} strokeWidth={2.5} />
        {t('editor.status.ready')}
      </span>
    );

  const changeKind = (to: SlideKind): void => {
    setMenu(null);
    if (to === kind) return;
    if (hasContent) setConfirm({ kind: 'changeKind', to });
    else controller.setKind(to);
  };

  const shownConfig =
    config ??
    previewConfig(draft, deck.id, {
      prompt: t('editor.promptPlaceholder'),
      option: (n) => t('editor.optionPlaceholder', { n }),
      statement: (n) => t('editor.statementPlaceholder', { n }),
    });
  const sample = previewResults(shownConfig);
  const preview = (
    <div className="flex min-h-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-muted">{t('editor.previewSample')}</span>
      <div className="aspect-video w-full overflow-hidden rounded-brand border border-line">
        <Stage
          data={{
            language: deck.settings.slideLanguage,
            theme: deck.settings.theme,
            showQr: deck.settings.showQr,
            joinCode: deck.joinCode || '000000',
            baseUrl: deck.baseUrl || window.location.origin,
            qaEnabled: deck.settings.qaEnabled,
            config: shownConfig,
            draft,
            item: sample.item,
            results: sample.results,
            participants: 42,
            leaderboard: sample.leaderboard,
            qa: sample.qa,
            connected: true,
            clockOffset: 0,
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="relative">
          <Button
            variant="quiet"
            aria-haspopup="menu"
            aria-expanded={menu === 'kind'}
            onClick={() => {
              setMenu(menu === 'kind' ? null : 'kind');
            }}
          >
            <KindIcon kind={kind} />
            {kindLabel(kind, t)}
            <ChevronDownIcon size={14} />
          </Button>
          <Menu
            open={menu === 'kind'}
            onClose={() => {
              setMenu(null);
            }}
            align="left"
          >
            {SLIDE_KINDS.map((k) => (
              <MenuItem
                key={k}
                onSelect={() => {
                  changeKind(k);
                }}
              >
                <KindIcon kind={k} />
                {kindLabel(k, t)}
              </MenuItem>
            ))}
          </Menu>
        </div>
        <div className="flex-1" />
        {deck.joinCode ? (
          <Button
            variant="quiet"
            title={t('editor.copyLink')}
            aria-label={`${t('stage.code')} ${formatJoinCode(deck.joinCode)}: ${t('editor.copyLink')}`}
            onClick={() => {
              const url = controller.joinUrl();
              if (url) {
                void copyText(url).then((ok) => {
                  controller.notifyLinkCopied(ok ? null : url);
                });
              }
            }}
          >
            <span
              className={`inline-block size-2 rounded-full ${connected ? 'bg-red' : 'bg-line'}`}
              aria-hidden="true"
            />
            <span className="tabular">
              {wide ? `${t('stage.code')} ` : ''}
              {formatJoinCode(deck.joinCode)}
            </span>
          </Button>
        ) : null}
        <div className="relative">
          <Button
            variant="quiet"
            aria-label={t('editor.menu')}
            aria-haspopup="menu"
            aria-expanded={menu === 'more'}
            onClick={() => {
              setMenu(menu === 'more' ? null : 'more');
            }}
          >
            <MoreIcon />
          </Button>
          <Menu
            open={menu === 'more'}
            onClose={() => {
              setMenu(null);
            }}
          >
            {isQuestion ? (
              <MenuItem
                disabled={!connected}
                onSelect={() => {
                  setMenu(null);
                  setConfirm({ kind: 'reset' });
                }}
              >
                {t('editor.menu.reset')}
              </MenuItem>
            ) : null}
            {isQuestion && draft.type !== 'quiz' ? (
              <MenuItem
                disabled={!connected || !config}
                onSelect={() => {
                  setMenu(null);
                  controller.command(closed ? 'item:reopen' : 'item:close');
                }}
              >
                {closed ? t('editor.menu.reopen') : t('editor.menu.close')}
              </MenuItem>
            ) : null}
            <MenuItem
              disabled={!connected}
              onSelect={() => {
                setMenu(null);
                void controller.openDashboard();
              }}
            >
              {t('editor.menu.dashboard')}
            </MenuItem>
            <MenuItem
              onSelect={() => {
                setMenu(null);
                setShowSettings(true);
              }}
            >
              {t('editor.menu.settings')}
            </MenuItem>
            <MenuItem
              onSelect={() => {
                setMenu(null);
                controller.fork();
              }}
            >
              {t('editor.menu.fork')}
            </MenuItem>
          </Menu>
        </div>
        <Button variant="primary" onClick={onDone}>
          {t('editor.done')}
        </Button>
      </header>

      {state.retentionNotice ? (
        <Banner
          onClose={() => {
            controller.dismissRetentionNotice();
          }}
          closeLabel={t('common.close')}
        >
          {t('editor.deckDeleted', { days: live.deck?.retentionDays ?? 90 })}
        </Banner>
      ) : null}
      {state.duplicate ? (
        <Banner>
          {t('editor.duplicateBanner')}{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              controller.fork();
            }}
          >
            {t('editor.duplicateAction')}
          </button>
        </Banner>
      ) : null}

      <main
        className={`min-h-0 flex-1 ${wide ? 'grid grid-cols-[minmax(300px,46%)_minmax(0,1fr)] gap-4 overflow-hidden px-3 py-3' : 'overflow-auto px-3 py-3'}`}
      >
        <div className={`flex flex-col gap-4 ${wide ? 'min-h-0 overflow-auto pr-1' : ''}`}>
          {showSettings ? (
            <SettingsPanel
              settings={deck.settings}
              onChange={(patch) => {
                controller.updateDeckSettings(patch);
              }}
              onClose={() => {
                setShowSettings(false);
              }}
              t={t}
            />
          ) : null}
          <ItemForm
            key={`${draft.id}-${kind}`}
            draft={draft}
            onChange={(fn) => {
              controller.updateDraft(fn);
            }}
            deckSettings={deck.settings}
            onDeckSettings={(patch) => {
              controller.updateDeckSettings(patch);
            }}
            t={t}
          />
          {isQuestion ? (
            <ResultsPeek
              results={live.results}
              t={t}
              onHideResponse={(id) => {
                controller.hideResponse(id);
              }}
              onHideWord={(key) => {
                controller.hideWord(key);
              }}
            />
          ) : null}
        </div>
        {wide ? preview : null}
      </main>

      <footer
        className="flex flex-none items-center justify-between gap-3 border-t border-line px-3 py-1.5 text-[12px] text-muted"
        role="status"
      >
        <span className="min-w-0 truncate">{status}</span>
        {state.showSaveReminder ? (
          <span className="shrink-0">{t('editor.saveHint', { shortcut: isMac() ? 'Cmd+S' : 'Strg+S' })}</span>
        ) : null}
      </footer>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'reset' ? t('editor.confirmReset.title') : t('editor.confirmKind.title')}
        body={confirm?.kind === 'reset' ? t('editor.confirmReset.body') : t('editor.confirmKind.body')}
        confirmLabel={confirm?.kind === 'reset' ? t('editor.confirmReset.confirm') : t('editor.confirmKind.confirm')}
        cancelLabel={t('common.cancel')}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          if (confirm?.kind === 'reset') controller.command('item:reset');
          if (confirm?.kind === 'changeKind') controller.setKind(confirm.to);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function Banner({ children, onClose, closeLabel }: { children: ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div className="flex flex-none items-start gap-2 border-b border-line bg-mist px-3 py-1.5" role="status">
      <p className="min-w-0 flex-1">{children}</p>
      {onClose ? (
        <button type="button" onClick={onClose} className="shrink-0 font-semibold text-navy underline">
          {closeLabel}
        </button>
      ) : null}
    </div>
  );
}
