import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { ProductMark } from './ProductMark';

/** Single column, max 520 px, left aligned (§11.5). Footer with privacy link and language toggle on every screen. */
export function Shell({
  children,
  banner,
  title,
}: {
  children: ReactNode;
  banner?: ReactNode;
  title?: string | null | undefined;
}) {
  const { t, language, setLanguage } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col">
      {banner}
      <header className="flex items-center justify-between gap-4 px-5 pt-4 pb-3">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
          className="rounded-brand"
        >
          <ProductMark />
        </a>
        {title ? (
          <span className="min-w-0 truncate rounded-full bg-mist px-3 py-1 text-[15px] font-semibold text-muted">
            {title}
          </span>
        ) : null}
      </header>
      <main className="flex flex-1 flex-col px-5">{children}</main>
      <footer className="mt-8 flex items-center justify-between gap-4 px-5 py-4 text-[15px] text-muted">
        <a
          href="/datenschutz"
          className="rounded-brand underline underline-offset-2 hover:text-primary"
          onClick={(e) => {
            e.preventDefault();
            navigate('/datenschutz');
          }}
        >
          {t('common.privacy')}
        </a>
        <div className="flex gap-1" role="group" aria-label="Sprache / Language">
          {(['de', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              lang={lang}
              aria-pressed={language === lang}
              onClick={() => {
                setLanguage(lang);
              }}
              className={`min-h-10 min-w-12 rounded-full px-2 font-bold uppercase ${language === lang ? 'bg-mist text-ink' : 'text-muted hover:text-primary'}`}
            >
              {lang}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}

/** Primary action pinned to the bottom of the viewport on phones (§11.5). */
export function StickyAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-6 bg-paper/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] backdrop-blur-sm">
      {children}
    </div>
  );
}
