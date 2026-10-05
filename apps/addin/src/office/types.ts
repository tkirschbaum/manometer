export type View = 'edit' | 'read';
export type Platform = 'PC' | 'Mac' | 'OfficeOnline' | 'iOS' | 'Android' | 'Universal' | 'harness' | 'unknown';

/** Credentials and join info shared by every slide of a presentation. */
export interface DeckLink {
  deckId: string;
  secret: string;
  joinCode: string;
  title: string;
}

/** Result of reading the presentation-level deck link: `supported` is false when the store is unavailable. */
export interface DocumentDeck {
  supported: boolean;
  link: DeckLink | null;
}

/**
 * Everything the add-in needs from its host. Only src/office/ talks to Office.js (§6.9);
 * the harness implements the same interface in memory for development without PowerPoint.
 */
export interface OfficeHost {
  readonly kind: 'office' | 'harness';
  readonly platform: Platform;
  readonly displayLanguage: string;
  /** Raw value of this instance's settings key, or null. Validation happens in model/settings.ts. */
  readSettings: () => unknown;
  writeSettings: (value: unknown) => Promise<boolean>;
  getView: () => Promise<View>;
  onViewChange: (handler: (view: View) => void) => () => void;
  /** Ids of the selected slides (in slideshow: the slide being shown); null if unavailable. */
  getSelectedSlideIds: () => Promise<string[] | null>;
  onSelectionChange: (handler: () => void) => () => void;
  openBrowserWindow: (url: string) => void;
  /** Document-level store for deck credentials (§6.4 path 1). Feature-detected; may be unsupported. */
  readDocumentDeck: () => Promise<DocumentDeck>;
  writeDocumentDeck: (link: DeckLink) => Promise<boolean>;
}
