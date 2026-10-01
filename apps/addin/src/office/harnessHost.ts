import type { DeckLink, OfficeHost, View } from './types';
import { deckLinkSchema } from '../model/schemas';

/**
 * In-memory stand-in for PowerPoint (§6.9), used at /addin/?harness=1 and whenever Office.js is not
 * available. Each "instance" (one add-in frame on one slide) keeps its settings in localStorage so that
 * several browser tabs behave like several slides of one presentation:
 *   ?harness=1&instance=A&slide=256
 */
export interface HarnessState {
  instance: string;
  /** The slide this frame sits on. */
  slideId: string;
  /** The slide currently shown (edit view selection or slideshow position). */
  currentSlideId: string;
  view: View;
}

const PREFIX = 'pulse.harness.';
const DOC_KEY = `${PREFIX}doc`;

export interface HarnessControls {
  getState: () => HarnessState;
  subscribe: (listener: () => void) => () => void;
  setView: (view: View) => void;
  showSlide: (slideId: string) => void;
  /** Simulates "Duplicate slide": copies this frame's settings to a new instance on a new slide (new tab). */
  duplicate: () => string;
  /** Simulates inserting a fresh frame on a new slide (empty settings, new tab). */
  insertNew: () => string;
}

export function createHarnessHost(params: URLSearchParams): { host: OfficeHost; controls: HarnessControls } {
  const instance = params.get('instance') ?? 'A';
  const slideId = params.get('slide') ?? '256';
  const settingsKey = `${PREFIX}settings.${instance}`;
  let state: HarnessState = {
    instance,
    slideId,
    currentSlideId: params.get('current') ?? slideId,
    view: params.get('view') === 'read' ? 'read' : 'edit',
  };
  const listeners = new Set<() => void>();
  const viewHandlers = new Set<(view: View) => void>();
  const selectionHandlers = new Set<() => void>();
  const emit = (): void => {
    for (const l of listeners) l();
  };

  const urlFor = (inst: string, slide: string): string => {
    const url = new URL(window.location.href);
    url.searchParams.set('harness', '1');
    url.searchParams.set('instance', inst);
    url.searchParams.set('slide', slide);
    url.searchParams.delete('current');
    url.searchParams.delete('view');
    return url.toString();
  };
  const nextSlideId = (): string => String(300 + Math.floor(Math.random() * 9000));

  const host: OfficeHost = {
    kind: 'harness',
    platform: 'harness',
    displayLanguage: params.get('lang') ?? navigator.language,
    readSettings: () => {
      try {
        return JSON.parse(window.localStorage.getItem(settingsKey) ?? 'null') as unknown;
      } catch {
        return null;
      }
    },
    writeSettings: (value) => {
      try {
        window.localStorage.setItem(settingsKey, JSON.stringify(value));
        return Promise.resolve(true);
      } catch {
        return Promise.resolve(false);
      }
    },
    getView: () => Promise.resolve(state.view),
    onViewChange: (handler) => {
      viewHandlers.add(handler);
      return () => viewHandlers.delete(handler);
    },
    getSelectedSlideIds: () => Promise.resolve([state.currentSlideId]),
    onSelectionChange: (handler) => {
      selectionHandlers.add(handler);
      return () => selectionHandlers.delete(handler);
    },
    openBrowserWindow: (url) => {
      window.open(url, '_blank', 'noopener');
    },
    readDocumentDeck: () => {
      try {
        const parsed = deckLinkSchema.safeParse(JSON.parse(window.localStorage.getItem(DOC_KEY) ?? 'null'));
        return Promise.resolve(parsed.success ? parsed.data : null);
      } catch {
        return Promise.resolve(null);
      }
    },
    writeDocumentDeck: (link: DeckLink) => {
      window.localStorage.setItem(DOC_KEY, JSON.stringify(link));
      return Promise.resolve(true);
    },
  };

  const controls: HarnessControls = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setView: (view) => {
      state = { ...state, view };
      emit();
      for (const h of viewHandlers) h(view);
    },
    showSlide: (id) => {
      state = { ...state, currentSlideId: id };
      emit();
      for (const h of selectionHandlers) h();
    },
    duplicate: () => {
      const copy = `${instance}-copy-${Math.floor(Math.random() * 1000)}`;
      const raw = window.localStorage.getItem(settingsKey);
      if (raw) window.localStorage.setItem(`${PREFIX}settings.${copy}`, raw);
      return urlFor(copy, nextSlideId());
    },
    insertNew: () => urlFor(`N${Math.floor(Math.random() * 1000)}`, nextSlideId()),
  };
  return { host, controls };
}
