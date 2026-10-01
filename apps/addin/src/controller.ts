import {
  STORAGE_KEYS,
  TIMING,
  defaultDeckSettings,
  languageFromLocale,
  newDeckSecret,
  newUuid,
  type DeckSettings,
  type SlideItemConfig,
} from '@pulse/shared';
import { Live } from './live/live';
import { forkDraft, missingFields, newDraft, toConfig, type MissingKey, type SlideKind } from './model/draft';
import { Heartbeat } from './model/heartbeat';
import { deckRegistry, type RegistryEntry } from './model/registry';
import { parseSettings, type AddinSettings, type ItemDraft } from './model/schemas';
import type { DeckLink, OfficeHost, View } from './office/types';

export type Notice = 'copyDetected' | 'linkCopied' | null;

export interface ControllerState {
  settings: AddinSettings;
  view: View;
  viewKnown: boolean;
  /** Read view only: this frame's slide is the slide being shown (§6.6). */
  onScreen: boolean;
  saving: boolean;
  toast: Notice;
  /** Deck was deleted by retention and silently recreated (§5.8). */
  retentionNotice: boolean;
  /** Heartbeat fallback found an older live instance with the same item id (§6.5). */
  duplicate: boolean;
  /** Registry entries offered to a fresh instance (§6.4); null while the document store is checked. */
  candidates: RegistryEntry[] | null;
  showSaveReminder: boolean;
}

/** FNV-1a: cheap change detection for lastSyncedHash (not security relevant). */
function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function sessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/**
 * One add-in instance (one frame on one slide). Owns persistence into the .pptx (§6.3), deck linking (§6.4),
 * copy detection (§6.5), server sync and slideshow activation (§6.6). React renders its snapshots.
 */
export class AddinController {
  readonly live = new Live();
  private state: ControllerState;
  private readonly listeners = new Set<() => void>();
  private readonly cleanups: (() => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private itemSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private deckSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private interacted = false;
  private activeItemId: string | null = null;
  private readonly heartbeat = new Heartbeat();
  private started = false;

  constructor(readonly host: OfficeHost) {
    this.state = {
      settings: parseSettings(host.readSettings()),
      view: 'edit',
      viewKnown: false,
      onScreen: false,
      saving: false,
      toast: null,
      retentionNotice: false,
      duplicate: false,
      candidates: null,
      showSaveReminder: false,
    };
  }

  // -- store -------------------------------------------------------------------------------

  getSnapshot = (): ControllerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  get settings(): AddinSettings {
    return this.state.settings;
  }

  get config(): SlideItemConfig | null {
    const { deck, item } = this.state.settings;
    return deck && item ? toConfig(item, deck.id) : null;
  }

  get missing(): MissingKey[] {
    return this.state.settings.item ? missingFields(this.state.settings.item) : [];
  }

  configHash(config: SlideItemConfig | null = this.config): string | null {
    return config ? hashString(JSON.stringify(config)) : null;
  }

  // -- lifecycle ---------------------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.host.getView().then((view) => {
      this.setView(view);
    });
    this.cleanups.push(
      this.host.onViewChange((view) => {
        this.setView(view);
      }),
    );
    this.cleanups.push(
      this.host.onSelectionChange(() => {
        if (this.state.view === 'read') void this.checkScreen();
      }),
    );
    this.cleanups.push(
      this.live.subscribe(() => {
        this.onLiveChange();
      }),
    );
    this.cleanups.push(
      this.live.onConnect(() => {
        this.onConnect();
      }),
    );
    const deck = this.state.settings.deck;
    if (deck) {
      this.live.setItem(this.state.settings.item?.id ?? null);
      this.live.connect(deck.id, deck.secret);
    }
  }

  stop(): void {
    this.started = false;
    for (const c of this.cleanups.splice(0)) c();
    for (const t of [this.saveTimer, this.itemSyncTimer, this.deckSyncTimer, this.toastTimer]) if (t) clearTimeout(t);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.heartbeat.stop();
    this.live.disconnect();
  }

  private setView(view: View): void {
    const previous = this.state.view;
    this.set({ view, viewKnown: true, ...(view === 'edit' ? { onScreen: false } : {}) });
    if (view === 'read') {
      this.heartbeat.stop();
      void this.checkScreen();
      this.pollTimer ??= setInterval(() => void this.checkScreen(), TIMING.slidePollMs);
    } else {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
      if (previous === 'read') this.applyActivation(false);
      this.enterEdit();
    }
  }

  private enterEdit(): void {
    const { deck } = this.state.settings;
    if (deck) {
      const link: DeckLink = {
        deckId: deck.id,
        secret: deck.secret,
        joinCode: deck.joinCode,
        title: deck.settings.title,
      };
      deckRegistry.remember(link);
      void this.host.readDocumentDeck().then((existing) => {
        if (existing?.deckId !== deck.id) void this.host.writeDocumentDeck(link);
      });
    } else if (this.state.candidates === null) {
      void this.offerDecks();
    }
    this.heartbeat.start(
      () => (this.state.view === 'edit' ? (this.state.settings.item?.id ?? null) : null),
      (duplicate) => {
        if (duplicate !== this.state.duplicate) this.set({ duplicate });
      },
    );
  }

  // -- persistence (§6.3) -------------------------------------------------------------------

  private update(fn: (s: AddinSettings) => AddinSettings): void {
    const next = fn(this.state.settings);
    if (next === this.state.settings) return;
    const itemChanged = next.item?.id !== this.state.settings.item?.id;
    this.set({ settings: next, saving: true });
    if (itemChanged) this.live.setItem(next.item?.id ?? null);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.host.writeSettings(this.state.settings).then(() => {
        this.set({ saving: false });
        if (!sessionFlag(STORAGE_KEYS.saveReminder)) {
          try {
            window.sessionStorage.setItem(STORAGE_KEYS.saveReminder, '1');
          } catch {
            // ignore
          }
          this.set({ showSaveReminder: true });
        }
      });
    }, TIMING.editorDebounceMs);
    this.scheduleItemSync();
  }

  dismissSaveReminder(): void {
    this.set({ showSaveReminder: false });
  }

  // -- deck linking (§6.4) ----------------------------------------------------------------------

  private async offerDecks(): Promise<void> {
    const fromDocument = await this.host.readDocumentDeck();
    if (fromDocument && !this.state.settings.deck) {
      this.linkDeck(fromDocument);
      return;
    }
    this.set({ candidates: deckRegistry.list() });
  }

  createDeck(): void {
    const link: DeckLink = { deckId: newUuid(), secret: newDeckSecret(), joinCode: '', title: '' };
    const settings: DeckSettings = {
      ...defaultDeckSettings,
      slideLanguage: languageFromLocale(this.host.displayLanguage),
    };
    this.update((s) => ({ ...s, deck: { id: link.deckId, secret: link.secret, joinCode: '', settings, baseUrl: '' } }));
    void this.host.writeDocumentDeck(link);
    deckRegistry.remember(link);
    this.live.connect(link.deckId, link.secret);
  }

  linkDeck(link: DeckLink): void {
    this.update((s) => ({
      ...s,
      deck: {
        id: link.deckId,
        secret: link.secret,
        joinCode: link.joinCode,
        settings: { ...defaultDeckSettings, title: link.title },
        baseUrl: '',
      },
    }));
    deckRegistry.remember(link);
    void this.host.writeDocumentDeck(link);
    this.live.connect(link.deckId, link.secret);
  }

  // -- item editing -------------------------------------------------------------------------------

  setKind(kind: SlideKind): void {
    this.update((s) => ({ ...s, item: newDraft(kind, s.item), lastSyncedHash: null }));
  }

  updateDraft(fn: (draft: ItemDraft) => ItemDraft): void {
    this.update((s) => (s.item ? { ...s, item: fn(s.item) } : s));
  }

  fork(): void {
    this.update((s) => (s.item ? { ...s, item: forkDraft(s.item), lastSyncedHash: null } : s));
    this.set({ duplicate: false });
  }

  updateDeckSettings(patch: Partial<DeckSettings>): void {
    this.update((s) => (s.deck ? { ...s, deck: { ...s.deck, settings: { ...s.deck.settings, ...patch } } } : s));
    if (this.deckSyncTimer) clearTimeout(this.deckSyncTimer);
    this.deckSyncTimer = setTimeout(() => {
      const deck = this.state.settings.deck;
      if (deck) void this.live.upsertDeck(deck.settings);
    }, TIMING.editorDebounceMs);
  }

  // -- copy detection on first editor interaction (§6.5) ------------------------------------------

  async onEditorInteraction(): Promise<void> {
    if (this.interacted || this.state.view !== 'edit') return;
    this.interacted = true;
    const ids = await this.host.getSelectedSlideIds();
    const current = ids?.length === 1 ? ids[0] : undefined;
    if (current === undefined) {
      this.interacted = false;
      return;
    }
    const bound = this.state.settings.boundSlideId;
    if (bound === null) {
      this.update((s) => ({ ...s, boundSlideId: current }));
    } else if (bound !== current) {
      this.update((s) => ({
        ...s,
        boundSlideId: current,
        item: s.item ? forkDraft(s.item) : s.item,
        lastSyncedHash: null,
      }));
      this.showToast('copyDetected');
    }
  }

  showToast(toast: Notice): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.set({ toast });
    this.toastTimer = setTimeout(() => {
      this.set({ toast: null });
    }, 3000);
  }

  // -- slideshow activation (§6.6) -----------------------------------------------------------------

  private currentView(): View {
    return this.state.view;
  }

  private async checkScreen(): Promise<void> {
    if (this.currentView() !== 'read') return;
    const ids = await this.host.getSelectedSlideIds();
    // The view may have changed while waiting.
    if (this.currentView() !== 'read' || ids?.length !== 1) return;
    const current = ids[0] ?? '';
    let bound = this.state.settings.boundSlideId;
    if (bound === null) {
      // Never interacted with in edit view: bind to the slide shown when it first appears (see docs/progress.md).
      bound = current;
      this.update((s) => ({ ...s, boundSlideId: current }));
    }
    const onScreen = current === bound;
    if (onScreen !== this.state.onScreen) {
      this.set({ onScreen });
      this.applyActivation(onScreen);
    }
  }

  private applyActivation(onScreen: boolean): void {
    const config = this.config;
    if (onScreen && config) {
      this.activeItemId = config.id;
      void this.live.activate(config);
    } else if (!onScreen && this.activeItemId) {
      const id = this.activeItemId;
      this.activeItemId = null;
      void this.live.deactivate(id);
    }
  }

  // -- server sync ------------------------------------------------------------------------------------

  private onConnect(): void {
    const config = this.config;
    if (this.state.onScreen && config) {
      // Re-activate after a reconnect or server restart.
      this.activeItemId = config.id;
      void this.live.activate(config);
    } else if (config) {
      void this.syncItem(config);
    }
  }

  private scheduleItemSync(): void {
    if (this.itemSyncTimer) clearTimeout(this.itemSyncTimer);
    this.itemSyncTimer = setTimeout(() => {
      const config = this.config;
      if (config && this.configHash(config) !== this.state.settings.lastSyncedHash) void this.syncItem(config);
    }, TIMING.editorDebounceMs);
  }

  private async syncItem(config: SlideItemConfig): Promise<void> {
    if (this.live.getSnapshot().status !== 'connected') return;
    const ok = await this.live.upsertItem(config);
    const hash = this.configHash(config);
    if (ok && hash !== this.state.settings.lastSyncedHash && this.configHash() === hash) {
      this.update((s) => ({ ...s, lastSyncedHash: hash }));
    }
  }

  private lastDeckState: unknown = null;

  private onLiveChange(): void {
    const live = this.live.getSnapshot();
    const deckState = live.deck;
    const local = this.state.settings.deck;
    if (!deckState || !local || deckState === this.lastDeckState) return;
    this.lastDeckState = deckState;
    if (live.createdOnConnect) {
      this.live.acknowledgeCreated();
      // The server just created the deck: either brand new, or recreated after retention deleted it (§5.8).
      if (local.joinCode !== '') this.set({ retentionNotice: true });
      void this.live.upsertDeck(local.settings);
    }
    const settings = live.createdOnConnect ? local.settings : deckState.settings;
    if (
      deckState.joinCode !== local.joinCode ||
      deckState.publicBaseUrl !== local.baseUrl ||
      JSON.stringify(settings) !== JSON.stringify(local.settings)
    ) {
      this.update((s) =>
        s.deck
          ? { ...s, deck: { ...s.deck, joinCode: deckState.joinCode, baseUrl: deckState.publicBaseUrl, settings } }
          : s,
      );
      deckRegistry.remember({
        deckId: local.id,
        secret: local.secret,
        joinCode: deckState.joinCode,
        title: settings.title,
      });
    }
  }

  dismissRetentionNotice(): void {
    this.set({ retentionNotice: false });
  }

  // -- presenter actions ---------------------------------------------------------------------------------

  private get itemId(): string | null {
    return this.state.settings.item?.id ?? null;
  }

  command(event: 'item:reveal' | 'item:close' | 'item:reopen' | 'item:reset'): void {
    const id = this.itemId;
    const config = this.config;
    if (!id || !config) return;
    // The item must exist on the server first (it may never have been activated).
    void this.live.upsertItem(config).then(() => this.live.command(event, id));
  }

  hideResponse(responseId: string): void {
    const id = this.itemId;
    if (id) void this.live.hideResponse(id, { responseId });
  }

  hideWord(wordKey: string): void {
    const id = this.itemId;
    if (id) void this.live.hideResponse(id, { wordKey });
  }

  async openDashboard(): Promise<void> {
    const url = await this.live.exportUrl();
    if (url) this.host.openBrowserWindow(url);
  }

  joinUrl(): string | null {
    const deck = this.state.settings.deck;
    return deck?.baseUrl && deck.joinCode ? `${deck.baseUrl}/${deck.joinCode}` : null;
  }
}
