import { formatJoinCode, type Translate } from '@pulse/shared';
import { useState } from 'react';
import type { AddinController, ControllerState } from '../controller';
import type { LiveState } from '../live/live';
import { SLIDE_KINDS, kindOf, type SlideKind } from '../model/draft';
import { Stage } from '../stage/Stage';
import { Button, ConfirmDialog, Menu, MenuItem, Toast } from '../ui/controls';
import { ChevronDownIcon, EyeIcon, KindIcon, MoreIcon } from '../ui/icons';
import { EmptyState } from './EmptyState';
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

/** Edit-mode UI inside the frame (§6.8). */
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
  const { settings } = state;
  const [menu, setMenu] = useState<'kind' | 'more' | null>(null);
  const [preview, setPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'reset' } | { kind: 'changeKind'; to: SlideKind } | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  if (webUnsupported) {
    return (
      <div className="flex h-full items-center p-6">
        <p role="alert" className="text-[16px] font-semibold text-navy">
          {t('editor.webUnsupported')}
        </p>
      </div>
    );
  }

  const deck = settings.deck;
  if (!deck) {
    return (
      <EmptyState
        candidates={state.candidates}
        onCreate={() => {
          controller.createDeck();
        }}
        onLink={(link) => {
          controller.linkDeck(link);
        }}
        t={t}
      />
    );
  }
  const draft = settings.item;
  if (!draft) {
    return (
      <KindPicker
        onPick={(kind) => {
          controller.setKind(kind);
        }}
        t={t}
      />
    );
  }

  const kind = kindOf(draft);
  const config = controller.config;
  const missing = controller.missing;
  const connected = live.status === 'connected';
  const synced = config !== null && controller.configHash(config) === settings.lastSyncedHash;
  const isQuestion = draft.kind === 'question';
  const closed = live.item?.state === 'closed';
  const hasContent = draft.prompt.trim().length > 0 || draft.options.some((o) => o.label.trim());

  const status = state.saving
    ? t('editor.status.saving')
    : missing.length > 0
      ? t('editor.status.incomplete', { missing: missing.map((m) => t(m)).join(', ') })
      : !connected
        ? t('editor.status.offline')
        : synced || !isQuestion
          ? t('editor.status.saved')
          : t('editor.status.savedLocal');

  const changeKind = (to: SlideKind): void => {
    setMenu(null);
    if (to === kind) return;
    if (hasContent) setConfirm({ kind: 'changeKind', to });
    else controller.setKind(to);
  };

  const sample = previewResults(config);

  return (
    <div
      className="flex h-full flex-col"
      onPointerDownCapture={() => void controller.onEditorInteraction()}
      onFocusCapture={() => void controller.onEditorInteraction()}
    >
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
            onClick={() => {
              const url = controller.joinUrl();
              if (url) {
                void copyText(url).then((ok) => {
                  setCopyFallback(ok ? null : url);
                  controller.showToast('linkCopied');
                });
              }
            }}
          >
            <span
              className={`inline-block size-2 rounded-full ${connected ? 'bg-red' : 'bg-line'}`}
              aria-hidden="true"
            />
            <span className="tabular">
              {t('stage.code')} {formatJoinCode(deck.joinCode)}
            </span>
          </Button>
        ) : null}
        <Button
          variant={preview ? 'primary' : 'quiet'}
          aria-pressed={preview}
          onClick={() => {
            setPreview(!preview);
          }}
        >
          <EyeIcon size={16} />
          {t('editor.preview')}
        </Button>
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
      {state.showSaveReminder ? (
        <Banner
          onClose={() => {
            controller.dismissSaveReminder();
          }}
          closeLabel={t('common.close')}
        >
          {t('editor.saveReminder', { shortcut: isMac() ? 'Cmd+S' : 'Strg+S' })}
        </Banner>
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto px-3 py-3">
        {preview ? (
          <div
            className="mx-auto aspect-video overflow-hidden rounded-brand border border-line"
            style={{ width: 'min(100%, calc((100vh - 120px) * 16 / 9))' }}
          >
            <Stage
              data={{
                language: deck.settings.slideLanguage,
                theme: deck.settings.theme,
                showQr: deck.settings.showQr,
                joinCode: deck.joinCode || '000000',
                baseUrl: deck.baseUrl || window.location.origin,
                qaEnabled: deck.settings.qaEnabled,
                config,
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
        ) : (
          <div className="flex flex-col gap-4">
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
        )}
      </main>

      <footer
        className="flex flex-none items-center gap-2 border-t border-line px-3 py-1.5 text-[12px] text-muted"
        role="status"
      >
        <span className="min-w-0 truncate">{status}</span>
      </footer>

      <Toast
        message={
          state.toast === 'copyDetected'
            ? t('editor.copyDetected')
            : state.toast === 'linkCopied'
              ? (copyFallback ?? t('editor.linkCopied'))
              : null
        }
      />
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

function Banner({
  children,
  onClose,
  closeLabel,
}: {
  children: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div className="flex flex-none items-start gap-2 border-b border-line bg-mist px-3 py-1.5" role="status">
      <p className="min-w-0 flex-1">{children}</p>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 font-semibold text-navy underline"
          aria-label={closeLabel}
        >
          {closeLabel}
        </button>
      ) : null}
    </div>
  );
}
