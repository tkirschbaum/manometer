import type { MessageKey, Translate } from '@pulse/shared';
import { SLIDE_KINDS, type SlideKind } from '../model/draft';
import { KindIcon } from '../ui/icons';

export function kindLabel(kind: SlideKind, t: Translate): string {
  return t(`type.${kind}` as MessageKey);
}

/** First step after linking: choose what this slide is (§6.1 step 3). */
export function KindPicker({ onPick, t }: { onPick: (kind: SlideKind) => void; t: Translate }) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <h1 className="text-[18px] font-bold text-navy">{t('editor.pickKind')}</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {SLIDE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              onPick(kind);
            }}
            className="flex items-center gap-2 rounded-brand border border-line px-3 py-2.5 text-left font-semibold text-navy hover:border-navy"
          >
            <KindIcon kind={kind} />
            {kindLabel(kind, t)}
          </button>
        ))}
      </div>
    </div>
  );
}
